import { CLASS_ROWS, EMBEDDED_STATE_FORMAT, INVENTORY_ROWS, PDF_STATE_CHUNK_FIELD_PREFIX, PDF_STATE_MANIFEST_FIELD, PDF_STATE_MARKER_END, PDF_STATE_MARKER_START, PDF_TEMPLATE_ASSET, PDF_VISIBLE_FIELD_TEXT_LIMIT, SAVE_SLOTS_KEY, SPREADSHEET_CELL_TEXT_LIMIT, SPREADSHEET_META_SHEET, SPREADSHEET_TEMPLATE_ASSET, XLSX_CONTENT_TYPES_NS, XLSX_MAIN_NS, XLSX_OFFICE_REL_NS, XLSX_REL_NS, XLSX_WORKSHEET_CONTENT_TYPE, XLSX_WORKSHEET_REL_TYPE } from "./constants.js";
import { cleanText } from "./utils.js";
import { createDefaultState, getSavedSlots, mergeBuilderState, mergePlayState, persistWorkingState, setActiveSaveSlotId, state, trySetLocalStorage } from "./state.js";
import { alignLoadedStateGameVersion, exportPrepCache, getBreakthroughBudgetState, getClassDetail, getDefaultGameVersionId, getSelectedGameVersionId, getStartingFundsState, lookup, shouldPromoteSavedVersionToLatest } from "./rules.js";
import { PDF_LONG_TEXT_FIELDS, appendFieldText, applyStateToDom, base64ToBytes, buildExportFileStem, buildPdfImportPayload, buildSlotId, buildSpreadsheetExportCellMap, buildSpreadsheetImportPayload, buildSpreadsheetMetadataSheet, compactSaveSlotEntry, createStateSnapshot, createStorableStateSnapshot, decodeEmbeddedStateText, fillAbilityField, firstEmptyField, getBreakthroughRequirementStatus, getStorageFailureMessage, hydrateBuilderSelectionsFromFields, normalizeCurrentPortraitDataUrl, openLoadSavedModal, openSaveSlotModal, prepareExportCache, promptForSlotName, refreshSaveSlotList, renderBuilder, setStatus, showExportFailureModal, showExportSuccessModal, syncNameFields, updateSheetModalProgress, withTimeout } from "./ui.js";
import { ensurePdfRuntimeLoaded, ensureSpreadsheetRuntimeLoaded } from "./runtime-loader.js";









export function parseNumericCost(value) {const match = cleanText(value).match(/-?\d+/);
      return match ? Number(match[0]) : 0;
    }
export function parseClimCost(value) {
      const text = cleanText(value);
      if (!text || /varies|special|see/i.test(text)) {
        return 0;
      }
const match = text.match(/(\d[\d,]*)/);
      return match ? Number(match[1].replace(/,/g, "")) : 0;
    }
function decodeEmbeddedStatePackage(packageData) {
      if (!packageData) {
        return "";
      }
      if (packageData.legacyText) {
        return packageData.legacyText;
      }
      if (packageData.format !== EMBEDDED_STATE_FORMAT || !Array.isArray(packageData.chunks)) {
        return "";
      }
      return decodeEmbeddedStateText(packageData.chunks.join(""), packageData.encoding);
    }
async function tryDecodeEmbeddedStatePackage(packageData, sourceLabel = "embedded character data") {
      try {
        return await decodeEmbeddedStatePackage(packageData);
      } catch (error) {
        console.warn(`${sourceLabel} could not be decoded; falling back to visible sheet fields.`, error);
        return "";
      }
    }
export function getSavedSlotStore() {
      try {
        const raw = localStorage.getItem(SAVE_SLOTS_KEY);
const parsed = raw ? JSON.parse(raw) : {};
const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
        return {
          version: 1,
          slots: slots.filter((entry) => entry && entry.id && entry.snapshot)
        };
      } catch (error) {
        console.error(error);
        return { version: 1, slots: [] };
      }
    }
function persistSavedSlotStore(store) {
      try {
        localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify({
          version: 1,
          slots: Array.isArray(store?.slots) ? store.slots.map(compactSaveSlotEntry).filter(Boolean) : []
        }));
      } catch (error) {
        throw new Error(getStorageFailureMessage(error));
      }
    }
export function persistSavedSlotStoreQuietly(store) {
      trySetLocalStorage(SAVE_SLOTS_KEY, JSON.stringify({
        version: 1,
        slots: Array.isArray(store?.slots) ? store.slots.map(compactSaveSlotEntry).filter(Boolean) : []
      }), "saved character slots");
    }
export function deriveSaveSlotName() {
      const baseName = cleanText(state.fields.Name) || "Unnamed Character";
      return baseName;
    }
function upsertSaveSlot({ name, slotId = "", setActive = true } = {}) {const store = getSavedSlotStore();
const targetId = slotId || buildSlotId();
const slotName = cleanText(name) || deriveSaveSlotName();
const existing = store.slots.find((entry) => entry.id === targetId);
const nextSlot = {
        id: targetId,
        name: slotName,
        savedAt: new Date().toISOString(),
        snapshot: createStorableStateSnapshot()
      };
      if (existing) {
        Object.assign(existing, nextSlot);
      } else {
        store.slots.push(nextSlot);
      }
      persistSavedSlotStore(store);
      if (setActive) {
        setActiveSaveSlotId(targetId);
      }
      persistWorkingState(false);
      return nextSlot;
    }
function deleteSaveSlot(slotId) {
      const store = getSavedSlotStore();
      store.slots = store.slots.filter((entry) => entry.id !== slotId);
      persistSavedSlotStore(store);
      if (state.ui.activeSaveSlotId === slotId) {
        setActiveSaveSlotId("");
      }
      persistWorkingState(false);
    }
export function openSheetModal({ eyebrow = "Character Tools", title = "Sheet Actions", lead = "", content = "" } = {}) {
      const modal = document.getElementById("sheet-modal");
      document.getElementById("sheet-modal-eyebrow").textContent = eyebrow;
      document.getElementById("sheet-modal-title").textContent = title;
      document.getElementById("sheet-modal-lead").textContent = lead;
      document.getElementById("sheet-modal-content").innerHTML = content;
      modal.hidden = false;
      modal.classList.remove("is-hidden");
      modal.setAttribute("aria-hidden", "false");
    }
export function closeSheetModal() {
      const modal = document.getElementById("sheet-modal");
      modal.hidden = true;
      modal.classList.add("is-hidden");
      modal.setAttribute("aria-hidden", "true");
      document.getElementById("sheet-modal-content").innerHTML = "";
    }
function downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 2000);
    }
function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Could not read the selected file."));
        reader.readAsText(file);
      });
    }
function readFileAsArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Could not read the selected file."));
        reader.readAsArrayBuffer(file);
      });
    }
function getEmbeddedExportAssetArrayBuffer(assetPath) {
      const embeddedAsset = window.LYRIAN_EXPORT_ASSETS?.[assetPath];
      if (!embeddedAsset) {
        return null;
      }
const bytes = base64ToBytes(embeddedAsset);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
async function readAssetArrayBuffer(assetPath) {
      if (window.location.protocol === "file:") {
        const embeddedAsset = getEmbeddedExportAssetArrayBuffer(assetPath);
        if (embeddedAsset) {
          return embeddedAsset;
        }
      }
const assetUrl = new URL(assetPath, window.location.href).toString();
      try {
        const response = await fetch(assetUrl);
        if (!response.ok) {
          throw new Error(`Asset fetch failed for ${assetPath}.`);
        }
        return await response.arrayBuffer();
      } catch (fetchError) {
        const embeddedAsset = getEmbeddedExportAssetArrayBuffer(assetPath);
        if (embeddedAsset) {
          return embeddedAsset;
        }
        return await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("GET", assetUrl, true);
          request.responseType = "arraybuffer";
          request.onload = () => {
            if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
              resolve(request.response);
              return;
            }
            reject(fetchError);
          };
          request.onerror = () => reject(fetchError);
          request.send();
        });
      }
    }
function readImageAssetArrayBuffer(assetPath) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error(`Could not read image asset ${assetPath}.`));
                return;
              }
              blob.arrayBuffer().then(resolve, reject);
            }, "image/png");
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error(`Could not load image asset ${assetPath}.`));
        image.src = new URL(assetPath, window.location.href).toString();
      });
    }
async function readExportAssetArrayBuffer(assetPath) {
      try {
        return await readAssetArrayBuffer(assetPath);
      } catch (error) {
        if (/\.png$/i.test(assetPath)) {
          return readImageAssetArrayBuffer(assetPath);
        }
        throw error;
      }
    }
export function extractAbilityHeading(rawText, fallback = "") {
      const text = cleanText(rawText);
      if (!text) {
        return fallback;
      }
const firstLine = cleanText(text.split(/\n+/)[0]);
      return firstLine || fallback;
    }
function getPdfChunkFieldName(index) {
      return `${PDF_STATE_CHUNK_FIELD_PREFIX}${String(index + 1).padStart(4, "0")}`;
    }
function getPdfVisibleFieldText(fieldName, value) {
      const text = String(value || "");
      if (text.length <= PDF_VISIBLE_FIELD_TEXT_LIMIT) {
        return text;
      }
      return `${text.slice(0, PDF_VISIBLE_FIELD_TEXT_LIMIT - 88)}\n[Visible PDF text shortened. Full data is preserved for import.]`;
    }
function getOrCreatePdfTextField(form, fieldName) {
      try {
        return form.getTextField(fieldName);
      } catch (error) {
        return form.createTextField(fieldName);
      }
    }
function addPdfEmbeddedStateFields(form, packageData) {
      const manifest = getOrCreatePdfTextField(form, PDF_STATE_MANIFEST_FIELD);
      manifest.setText(JSON.stringify({
        format: packageData.format,
        encoding: packageData.encoding,
        chunkCount: packageData.chunkCount,
        chunkSize: packageData.chunkSize,
        originalLength: packageData.originalLength
      }));
      manifest.enableReadOnly();

      packageData.chunks.forEach((chunk, index) => {
        const field = getOrCreatePdfTextField(form, getPdfChunkFieldName(index));
        field.enableMultiline();
        field.setText(chunk);
        field.enableReadOnly();
      });
    }
function parseEmbeddedStateMarker(rawText) {
      const text = String(rawText || "");
const start = text.indexOf(PDF_STATE_MARKER_START);
const end = text.indexOf(PDF_STATE_MARKER_END);
      if (start < 0 || end < 0 || end <= start) {
        return "";
      }
      return text.slice(start + PDF_STATE_MARKER_START.length, end);
    }
function extractPdfEmbeddedPackage(fieldMap) {
      const manifestText = cleanText(fieldMap[PDF_STATE_MANIFEST_FIELD]);
      if (manifestText) {
        try {
          const manifest = JSON.parse(manifestText);
          if (manifest?.format === EMBEDDED_STATE_FORMAT) {
            const count = Math.max(0, Number(manifest.chunkCount) || 0);
const chunks = Array.from({ length: count }, (_, index) => fieldMap[getPdfChunkFieldName(index)] || "");
            if (chunks.length && chunks.every((chunk) => typeof chunk === "string")) {
              return { ...manifest, chunks };
            }
          }
        } catch (error) {
          console.warn("Embedded PDF state manifest could not be read.", error);
        }
      }
const legacyText = parseEmbeddedStateMarker(fieldMap._LyrianState);
      return legacyText ? { legacyText } : null;
    }
function getPdfFieldRect(pageConfig, field) {
      const width = pageConfig.width * (field.width / 100);
const height = pageConfig.height * (field.height / 100);
const x = pageConfig.width * (field.left / 100);
const yTop = pageConfig.height * (field.top / 100);
const y = pageConfig.height - yTop - height;
      return { x, y, width, height };
    }
function getPdfFieldFontSize(fieldName, rect) {
      if (PDF_LONG_TEXT_FIELDS.has(fieldName)) {
        return Math.max(6, Math.min(9, rect.height * 0.42));
      }
      if (/^Name\d*$/.test(fieldName)) {
        return Math.max(10, Math.min(14, rect.height * 0.72));
      }
      return Math.max(7, Math.min(11, rect.height * 0.68));
    }
function getPdfFieldConfig(fieldName) {
      for (const pageConfig of window.LYRIAN_FORM_MAP.pages) {
        const field = pageConfig.fields.find((entry) => entry.name === fieldName);
        if (field) {
          return { pageConfig, field };
        }
      }
      return null;
    }
function setPdfTemplateFieldValue(form, fieldName, value) {
      let textField;
      try {
        textField = form.getTextField(fieldName);
      } catch (error) {
        return false;
      }
      if (PDF_LONG_TEXT_FIELDS.has(fieldName)) {
        textField.enableMultiline();
      }
      textField.setText(getPdfVisibleFieldText(fieldName, value));
const config = getPdfFieldConfig(fieldName);
      if (config && typeof textField.setFontSize === "function") {
        textField.setFontSize(getPdfFieldFontSize(fieldName, getPdfFieldRect(config.pageConfig, config.field)));
      }
      return true;
    }
function setWorksheetValue(sheet, address, value) {
      if (!sheet) {
        return;
      }
      window.XLSX.utils.sheet_add_aoa(sheet, [[capSpreadsheetCellValue(value)]], { origin: address });
    }
function capSpreadsheetCellValue(value) {
      if (typeof value !== "string" || value.length <= SPREADSHEET_CELL_TEXT_LIMIT) {
        return value;
      }
      return `${value.slice(0, SPREADSHEET_CELL_TEXT_LIMIT - 92)}\n[Visible spreadsheet text shortened. Full data is preserved for import.]`;
    }
export function getWorksheetText(sheet, address) {
      if (!sheet || !sheet[address] || sheet[address].v == null) {
        return "";
      }
      return cleanText(sheet[address].v);
    }
export function getWorksheetNumberText(sheet, address) {
      if (!sheet || !sheet[address] || sheet[address].v == null || sheet[address].v === "") {
        return "";
      }
      return String(sheet[address].v);
    }
async function attachSpreadsheetMetadataSheet(workbook, preparedPackage = null) {
      const metaSheet = await buildSpreadsheetMetadataSheet(preparedPackage);
      workbook.Sheets[SPREADSHEET_META_SHEET] = metaSheet;
      if (!workbook.SheetNames.includes(SPREADSHEET_META_SHEET)) {
        workbook.SheetNames.push(SPREADSHEET_META_SHEET);
      }
      workbook.Workbook = workbook.Workbook || {};
      workbook.Workbook.Sheets = workbook.SheetNames.map((name) => ({
        name,
        Hidden: name === SPREADSHEET_META_SHEET ? 1 : 0
      }));
    }
export function setSpreadsheetExportCell(cellMap, sheetName, address, value) {
      cellMap[sheetName] = cellMap[sheetName] || {};
      cellMap[sheetName][address] = capSpreadsheetCellValue(value);
    }
function parseXlsxXml(xmlText) {
      return new DOMParser().parseFromString(xmlText, "application/xml");
    }
function serializeXlsxXml(xmlDoc) {
      return new XMLSerializer().serializeToString(xmlDoc);
    }
function getXlsxElement(parent, namespaceUri, localName) {
      return parent.getElementsByTagNameNS(namespaceUri, localName)[0] || parent.getElementsByTagName(localName)[0];
    }
function getXlsxDirectChildren(parent, localName) {
      return Array.from(parent.children || []).filter((child) => child.localName === localName);
    }
function getWorkbookRelationshipId(sheetElement) {
      return sheetElement.getAttributeNS(XLSX_OFFICE_REL_NS, "id") || sheetElement.getAttribute("r:id") || "";
    }
function normalizeXlsxPartPath(target) {
      const cleanTarget = String(target || "").replace(/^\/+/, "");
      if (cleanTarget.startsWith("xl/")) {
        return cleanTarget;
      }
      return `xl/${cleanTarget}`;
    }
async function getXlsxWorkbookParts(zip) {
      const workbookDoc = parseXlsxXml(await zip.file("xl/workbook.xml").async("string"));
const relsDoc = parseXlsxXml(await zip.file("xl/_rels/workbook.xml.rels").async("string"));
const relationships = Array.from(relsDoc.getElementsByTagNameNS(XLSX_REL_NS, "Relationship"));
const relationshipTargets = new Map(relationships.map((rel) => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
const sheetPathByName = new Map();
const sheetsElement = getXlsxElement(workbookDoc, XLSX_MAIN_NS, "sheets");
      getXlsxDirectChildren(sheetsElement, "sheet").forEach((sheetElement) => {
        const name = sheetElement.getAttribute("name");
const target = relationshipTargets.get(getWorkbookRelationshipId(sheetElement));
        if (name && target) {
          sheetPathByName.set(name, normalizeXlsxPartPath(target));
        }
      });
      return { workbookDoc, relsDoc, sheetPathByName };
    }
function getCellAddressParts(address) {
      const match = String(address || "").toUpperCase().match(/^([A-Z]+)(\d+)$/);
      if (!match) {
        return null;
      }
      return { column: match[1], row: Number(match[2]) };
    }
function getColumnNumber(columnLetters) {
      return String(columnLetters || "").toUpperCase().split("").reduce((total, character) => {
        return total * 26 + character.charCodeAt(0) - 64;
      }, 0);
    }
function ensureXlsxRow(xmlDoc, sheetData, rowNumber) {let row = getXlsxDirectChildren(sheetData, "row").find((entry) => Number(entry.getAttribute("r")) === rowNumber);
      if (row) {
        return row;
      }
      row = xmlDoc.createElementNS(XLSX_MAIN_NS, "row");
      row.setAttribute("r", String(rowNumber));
const nextRow = getXlsxDirectChildren(sheetData, "row").find((entry) => Number(entry.getAttribute("r")) > rowNumber);
      if (nextRow) {
        sheetData.insertBefore(row, nextRow);
      } else {
        sheetData.appendChild(row);
      }
      return row;
    }
function ensureXlsxCell(xmlDoc, row, address) {
      const parts = getCellAddressParts(address);
      if (!parts) {
        return null;
      }
let cell = getXlsxDirectChildren(row, "c").find((entry) => String(entry.getAttribute("r")).toUpperCase() === address.toUpperCase());
      if (cell) {
        return cell;
      }
      cell = xmlDoc.createElementNS(XLSX_MAIN_NS, "c");
      cell.setAttribute("r", address.toUpperCase());
const targetColumn = getColumnNumber(parts.column);
const nextCell = getXlsxDirectChildren(row, "c").find((entry) => {
        const cellParts = getCellAddressParts(entry.getAttribute("r"));
        return cellParts && getColumnNumber(cellParts.column) > targetColumn;
      });
      if (nextCell) {
        row.insertBefore(cell, nextCell);
      } else {
        row.appendChild(cell);
      }
      return cell;
    }
function clearXlsxCellValue(cell) {
      Array.from(cell.children || []).forEach((child) => {
        if (["f", "v", "is"].includes(child.localName)) {
          cell.removeChild(child);
        }
      });
      cell.removeAttribute("t");
    }
function setXlsxCellValue(xmlDoc, sheetData, address, value) {
      const parts = getCellAddressParts(address);
      if (!parts) {
        return;
      }
const row = ensureXlsxRow(xmlDoc, sheetData, parts.row);
const cell = ensureXlsxCell(xmlDoc, row, address);
      if (!cell) {
        return;
      }
      clearXlsxCellValue(cell);
      if (value === null || value === undefined || value === "") {
        return;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        const valueElement = xmlDoc.createElementNS(XLSX_MAIN_NS, "v");
        valueElement.textContent = String(value);
        cell.appendChild(valueElement);
        return;
      }
      if (typeof value === "boolean") {
        cell.setAttribute("t", "b");
        const valueElement = xmlDoc.createElementNS(XLSX_MAIN_NS, "v");
        valueElement.textContent = value ? "1" : "0";
        cell.appendChild(valueElement);
        return;
      }
      cell.setAttribute("t", "inlineStr");
const inlineString = xmlDoc.createElementNS(XLSX_MAIN_NS, "is");
const textElement = xmlDoc.createElementNS(XLSX_MAIN_NS, "t");
      textElement.setAttribute("xml:space", "preserve");
      textElement.textContent = String(value);
      inlineString.appendChild(textElement);
      cell.appendChild(inlineString);
    }
async function patchXlsxWorksheetCells(zip, sheetPath, cellsByAddress) {
      const sheetFile = zip.file(sheetPath);
      if (!sheetFile) {
        return;
      }
const xmlDoc = parseXlsxXml(await sheetFile.async("string"));
const sheetData = getXlsxElement(xmlDoc, XLSX_MAIN_NS, "sheetData");
      if (!sheetData) {
        return;
      }
      Object.entries(cellsByAddress).forEach(([address, value]) => {
        setXlsxCellValue(xmlDoc, sheetData, address, value);
      });
      zip.file(sheetPath, serializeXlsxXml(xmlDoc));
    }
function createXlsxMetadataWorksheetXml(packageData) {
      const xmlDoc = document.implementation.createDocument(XLSX_MAIN_NS, "worksheet", null);
const worksheet = xmlDoc.documentElement;
const sheetData = xmlDoc.createElementNS(XLSX_MAIN_NS, "sheetData");
      worksheet.appendChild(sheetData);
const rows = [
        [EMBEDDED_STATE_FORMAT],
        ["encoding", packageData.encoding],
        ["chunkCount", packageData.chunkCount],
        ["chunkSize", packageData.chunkSize],
        ["originalLength", packageData.originalLength],
        [],
        ["chunkIndex", "chunk"],
        ...packageData.chunks.map((chunk, index) => [index + 1, chunk])
      ];
      rows.forEach((rowValues, rowIndex) => {
        rowValues.forEach((value, columnIndex) => {
          const address = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
          setXlsxCellValue(xmlDoc, sheetData, address, value);
        });
      });
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${serializeXlsxXml(xmlDoc)}`;
    }
function getNextXlsxSheetNumber(zip) {
      return Math.max(
        0,
        ...Object.keys(zip.files)
          .map((name) => name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/))
          .filter(Boolean)
          .map((match) => Number(match[1]) || 0)
      ) + 1;
    }
function getNextRelationshipId(relsDoc) {
      return `rId${Math.max(
        0,
        ...Array.from(relsDoc.getElementsByTagNameNS(XLSX_REL_NS, "Relationship"))
          .map((rel) => String(rel.getAttribute("Id") || "").match(/^rId(\d+)$/))
          .filter(Boolean)
          .map((match) => Number(match[1]) || 0)
      ) + 1}`;
    }
function getNextWorkbookSheetId(workbookDoc) {
      const sheetsElement = getXlsxElement(workbookDoc, XLSX_MAIN_NS, "sheets");
      return Math.max(
        0,
        ...getXlsxDirectChildren(sheetsElement, "sheet").map((sheet) => Number(sheet.getAttribute("sheetId")) || 0)
      ) + 1;
    }
function ensureWorkbookRecalculates(workbookDoc) {
      let calcPr = getXlsxElement(workbookDoc, XLSX_MAIN_NS, "calcPr");
      if (!calcPr) {
        calcPr = workbookDoc.createElementNS(XLSX_MAIN_NS, "calcPr");
        workbookDoc.documentElement.appendChild(calcPr);
      }
      calcPr.setAttribute("calcMode", "auto");
      calcPr.setAttribute("fullCalcOnLoad", "1");
      calcPr.setAttribute("forceFullCalc", "1");
    }
async function attachXlsxMetadataSheet(zip, packageData) {
      const { workbookDoc, relsDoc, sheetPathByName } = await getXlsxWorkbookParts(zip);
const metadataXml = createXlsxMetadataWorksheetXml(packageData);
let metadataPath = sheetPathByName.get(SPREADSHEET_META_SHEET);
      if (metadataPath) {
        zip.file(metadataPath, metadataXml);
const sheetsElement = getXlsxElement(workbookDoc, XLSX_MAIN_NS, "sheets");
const existingSheet = getXlsxDirectChildren(sheetsElement, "sheet").find((sheet) => sheet.getAttribute("name") === SPREADSHEET_META_SHEET);
        if (existingSheet) {
          existingSheet.setAttribute("state", "hidden");
        }
      } else {
        const sheetNumber = getNextXlsxSheetNumber(zip);
        metadataPath = `xl/worksheets/sheet${sheetNumber}.xml`;
const relationshipId = getNextRelationshipId(relsDoc);
const sheetId = getNextWorkbookSheetId(workbookDoc);

        zip.file(metadataPath, metadataXml);
const rel = relsDoc.createElementNS(XLSX_REL_NS, "Relationship");
        rel.setAttribute("Id", relationshipId);
        rel.setAttribute("Type", XLSX_WORKSHEET_REL_TYPE);
        rel.setAttribute("Target", `worksheets/sheet${sheetNumber}.xml`);
        relsDoc.documentElement.appendChild(rel);
const sheetsElement = getXlsxElement(workbookDoc, XLSX_MAIN_NS, "sheets");
const sheet = workbookDoc.createElementNS(XLSX_MAIN_NS, "sheet");
        sheet.setAttribute("name", SPREADSHEET_META_SHEET);
        sheet.setAttribute("sheetId", String(sheetId));
        sheet.setAttribute("state", "hidden");
        sheet.setAttributeNS(XLSX_OFFICE_REL_NS, "r:id", relationshipId);
        sheetsElement.appendChild(sheet);
const contentTypesDoc = parseXlsxXml(await zip.file("[Content_Types].xml").async("string"));
const hasOverride = Array.from(contentTypesDoc.getElementsByTagNameNS(XLSX_CONTENT_TYPES_NS, "Override"))
          .some((entry) => entry.getAttribute("PartName") === `/${metadataPath}`);
        if (!hasOverride) {
          const override = contentTypesDoc.createElementNS(XLSX_CONTENT_TYPES_NS, "Override");
          override.setAttribute("PartName", `/${metadataPath}`);
          override.setAttribute("ContentType", XLSX_WORKSHEET_CONTENT_TYPE);
          contentTypesDoc.documentElement.appendChild(override);
        }
        zip.file("[Content_Types].xml", serializeXlsxXml(contentTypesDoc));
      }
      ensureWorkbookRecalculates(workbookDoc);
      zip.file("xl/workbook.xml", serializeXlsxXml(workbookDoc));
      zip.file("xl/_rels/workbook.xml.rels", serializeXlsxXml(relsDoc));
    }
async function generateTemplateSpreadsheetWorkbook(cellMap, embeddedStatePackage) {
      if (!window.JSZip) {
        throw new Error("Spreadsheet template packaging is not available yet.");
      }
const templateBytes = await readAssetArrayBuffer(SPREADSHEET_TEMPLATE_ASSET);
const zip = await window.JSZip.loadAsync(templateBytes);
const { sheetPathByName } = await getXlsxWorkbookParts(zip);
      for (const [sheetName, cellsByAddress] of Object.entries(cellMap)) {
        const sheetPath = sheetPathByName.get(sheetName);
        if (!sheetPath) {
          console.warn(`Spreadsheet template is missing sheet: ${sheetName}`);
          continue;
        }
        await patchXlsxWorksheetCells(zip, sheetPath, cellsByAddress);
      }
      await attachXlsxMetadataSheet(zip, embeddedStatePackage);
      return zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
    }
async function createSpreadsheetExportWorkbook() {
      try {
        return window.XLSX.read(await readAssetArrayBuffer(SPREADSHEET_TEMPLATE_ASSET), { type: "array" });
      } catch (error) {
        console.warn("Spreadsheet template could not be loaded; using generated workbook fallback.", error);
const workbook = window.XLSX.utils.book_new();
const emptySheets = {
          Core: [["Lyrian Character Core"]],
          Abilities: [["Ability", "", "", "", "", "Description"]],
          Breakthrough: [["Breakthrough", "Cost"]],
          Inventory: [["Item", "Amount", "Bulk", "Cost", "", "Description"]],
          Journals: [["Player Notes"], [""]]
        };
        Object.entries(emptySheets).forEach(([sheetName, rows]) => {
          window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(rows), sheetName);
        });
        return workbook;
      }
    }
function extractSpreadsheetEmbeddedPackage(workbook) {
      const sheet = workbook?.Sheets?.[SPREADSHEET_META_SHEET];
      if (!sheet) {
        return null;
      }
      if (cleanText(sheet.A1?.v) === EMBEDDED_STATE_FORMAT) {
        const chunkCount = Math.max(0, Number(sheet.B3?.v) || 0);
const chunks = [];
        for (let index = 0; index < chunkCount; index += 1) {
          const row = 8 + index;
          chunks.push(String(sheet[`B${row}`]?.v || ""));
        }
        if (chunks.length) {
          return {
            format: EMBEDDED_STATE_FORMAT,
            encoding: cleanText(sheet.B2?.v),
            chunkCount,
            chunkSize: Math.max(0, Number(sheet.B4?.v) || 0),
            originalLength: Math.max(0, Number(sheet.B5?.v) || 0),
            chunks
          };
        }
      }
const legacyText = String(sheet.A2?.v || "");
      return legacyText ? { legacyText } : null;
    }
function extractSpreadsheetMetadata(workbook) {
      return tryDecodeEmbeddedStatePackage(extractSpreadsheetEmbeddedPackage(workbook), "Spreadsheet embedded character data");
    }
function parseStatePayload(raw) {
      if (!raw) {
        return null;
      }
      if (typeof raw === "object") {
        return raw;
      }
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.error(error);
        return null;
      }
    }
function hydrateStateFromObject(parsed, { activeSlotId = "", promoteStaleVersion = false } = {}) {
      if (!parsed || typeof parsed !== "object") {
        return false;
      }
const defaults = createDefaultState();
      state.ui = {
        ...defaults.ui,
        ...(parsed.ui || {})
      };
      if (!state.ui.gameVersion) {
        state.ui.gameVersion = getSelectedGameVersionId();
      } else if (promoteStaleVersion && shouldPromoteSavedVersionToLatest(state.ui.gameVersion)) {
        state.ui.gameVersion = getDefaultGameVersionId();
      }
      state.fields = parsed.fields || {};
      state.abilitySelections = parsed.abilitySelections || {};
      state.lastFocusedField = parsed.lastFocusedField || "";
      state.librarySelections = {
        ...defaults.librarySelections,
        ...(parsed.librarySelections || {})
      };
      state.builder = mergeBuilderState(parsed.builder || {});
      state.play = mergePlayState(parsed.play || {});
      hydrateBuilderSelectionsFromFields();
      setActiveSaveSlotId(activeSlotId || state.ui.activeSaveSlotId || "");
      applyStateToDom();
      if (state.fields.Name) {
        syncNameFields(state.fields.Name, "Name");
      }
      persistWorkingState(false);
      return true;
    }
export function loadSavedState(raw, options = {}) {
      const parsed = parseStatePayload(raw);
      if (!parsed) {
        if (options.statusOnFailure !== false) {
          setStatus("Could not read the character file.");
        }
        return false;
      }
      return hydrateStateFromObject(parsed, options);
    }
async function loadSaveSlotById(slotId) {
      const slot = getSavedSlots().find((entry) => entry.id === slotId);
      if (!slot) {
        setStatus("That saved character slot could not be found.");
        return false;
      }
const didLoad = loadSavedState(slot.snapshot, { activeSlotId: slot.id, statusOnFailure: true });
      if (didLoad) {
        await alignLoadedStateGameVersion({ statusLabel: `Loaded ${slot.name}` });
        closeSheetModal();
        if (cleanText(state.ui.gameVersion) === cleanText(window.LYRIAN_DATA?.version)) {
          setStatus(`Loaded ${slot.name}.`);
        }
      }
      return didLoad;
    }
export async function saveCurrentCharacterToNewSlot(explicitName) {
      let slotName = cleanText(explicitName || "");
      if (!slotName && explicitName === undefined) {
        slotName = promptForSlotName(deriveSaveSlotName());
      }
      if (!slotName) {
        slotName = deriveSaveSlotName();
      }
const slotListIsOpen = Boolean(document.getElementById("save-slot-list"));
      try {
        const portraitWasNormalized = await normalizeCurrentPortraitDataUrl();
const slot = upsertSaveSlot({ name: slotName });
        if (slotListIsOpen) {
          const savedAt = slot.savedAt ? new Date(slot.savedAt).toLocaleTimeString() : "now";
const note = portraitWasNormalized ? " Oversized portrait was compressed first." : "";
          refreshSaveSlotList(slot.id, `Saved "${slot.name}" at ${savedAt}.${note}`);
const input = document.getElementById("save-slot-name-input");
          if (input) {
            input.value = slot.name;
            input.focus();
            input.select();
          }
        } else {
          closeSheetModal();
        }
        setStatus(`Saved ${slot.name} to a new browser slot.`);
        return slot;
      } catch (error) {
        console.error("Browser save failed.", error);
const message = getStorageFailureMessage(error);
        if (slotListIsOpen) {
          refreshSaveSlotList("", message, true);
        }
        setStatus(`Save failed: ${message}`);
        return null;
      }
    }
export async function saveCurrentCharacterToActiveSlot() {
      if (!state.ui.activeSaveSlotId) {
        await saveCurrentCharacterToNewSlot();
        return;
      }
const store = getSavedSlotStore();
const slot = store.slots.find((entry) => entry.id === state.ui.activeSaveSlotId);
const slotName = promptForSlotName(slot?.name || deriveSaveSlotName());
      if (!slotName) {
        setStatus("Save cancelled.");
        return;
      }
      try {
        await normalizeCurrentPortraitDataUrl();
const nextSlot = upsertSaveSlot({ slotId: state.ui.activeSaveSlotId, name: slotName });
        closeSheetModal();
        setStatus(`Updated ${nextSlot.name}.`);
      } catch (error) {
        console.error("Browser save update failed.", error);
        setStatus(`Save failed: ${getStorageFailureMessage(error)}`);
      }
    }
async function overwriteSaveSlot(slotId) {
      const existing = getSavedSlots().find((entry) => entry.id === slotId);
      if (!existing) {
        setStatus("That saved character slot could not be found.");
        return;
      }
const slotName = promptForSlotName(existing.name || deriveSaveSlotName());
      if (!slotName) {
        setStatus("Save cancelled.");
        return;
      }
      try {
        await normalizeCurrentPortraitDataUrl();
const slot = upsertSaveSlot({ slotId, name: slotName });
        closeSheetModal();
        setStatus(`Updated ${slot.name}.`);
      } catch (error) {
        console.error("Browser save overwrite failed.", error);
        setStatus(`Save failed: ${getStorageFailureMessage(error)}`);
      }
    }
export async function handleSaveSlotAction(action, slotId) {
      if (action === "load") {
        loadSaveSlotById(slotId);
        return;
      }
      if (action === "delete") {
        const slot = getSavedSlots().find((entry) => entry.id === slotId);
        if (!slot) {
          setStatus("That saved character slot could not be found.");
          return;
        }
const confirmed = window.confirm(`Delete ${slot.name}? This cannot be undone.`);
        if (!confirmed) {
          return;
        }
        deleteSaveSlot(slotId);
        if (document.getElementById("sheet-modal") && !document.getElementById("sheet-modal").hidden) {
          openLoadSavedModal();
        }
        setStatus(`Deleted ${slot.name}.`);
        return;
      }
      if (action === "overwrite") {
        await overwriteSaveSlot(slotId);
      }
    }
export async function exportPdfState() {
      try {
        setStatus("Loading PDF export tools...");
        await ensurePdfRuntimeLoaded({ includeExportAssets: true });
        await updateSheetModalProgress("Preparing the official-style PDF sheet.", 5, "Gathering character fields and derived sheet values.");
        setStatus("Generating PDF character sheet...");
const portraitWasNormalized = await normalizeCurrentPortraitDataUrl();
        if (portraitWasNormalized) {
          await updateSheetModalProgress("Preparing the official-style PDF sheet.", 8, "Compressed an oversized portrait so the export data stays manageable.");
        }
const preparedExport = await prepareExportCache();
        await updateSheetModalProgress("Preparing the official-style PDF sheet.", 12, exportPrepCache.preparedAt ? "Using the prepared export cache for current character data." : "Prepared current character data for export.");
const { PDFDocument, StandardFonts } = window.PDFLib;
const templateBytes = await withTimeout(
          readExportAssetArrayBuffer(PDF_TEMPLATE_ASSET),
          15000,
          "PDF template load timed out."
        );
const pdfDoc = await withTimeout(
          PDFDocument.load(templateBytes, { ignoreEncryption: true }),
          20000,
          "PDF template parsing timed out."
        );
const form = pdfDoc.getForm();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
const fieldValues = preparedExport.pdfFieldValues;
        await updateSheetModalProgress("Preparing the official-style PDF sheet.", 20, "Loaded the official Character Sheet 1.2 PDF template.");
const embeddedStatePackage = preparedExport.embeddedStatePackage;
        await updateSheetModalProgress("Preparing the official-style PDF sheet.", 32, "Compressed the full import data into hidden chunks.");
const missingFields = [];
        Object.entries(fieldValues).forEach(([fieldName, value]) => {
          if (!setPdfTemplateFieldValue(form, fieldName, value)) {
            missingFields.push(fieldName);
          }
        });
        if (missingFields.length) {
          console.warn("PDF template is missing expected fields:", missingFields);
        }
        await updateSheetModalProgress("Filling the official-style PDF sheet.", 68, "Placed character values into the official template fields.");
        await updateSheetModalProgress("Finalizing the official-style PDF sheet.", 82, "Rendering visible PDF field appearances.");
        form.updateFieldAppearances(font);
        await updateSheetModalProgress("Finalizing the official-style PDF sheet.", 88, "Embedding hidden import data without changing the visible template.");
        addPdfEmbeddedStateFields(form, embeddedStatePackage);
        pdfDoc.setTitle(`${cleanText(state.fields.Name) || "Lyrian Character"} Sheet`);
        pdfDoc.setSubject("Lyrian Chronicles character export");
        pdfDoc.setCreator("Lyrian Chronicles Character Suite");
        pdfDoc.setProducer("Lyrian Chronicles Character Suite");
        await updateSheetModalProgress("Finalizing the official-style PDF sheet.", 94, "Saving the PDF file for download.");
const pdfBytes = await pdfDoc.save({ updateFieldAppearances: false });
const fileName = `${preparedExport.fileStem}.pdf`;
        await updateSheetModalProgress("Downloading the official-style PDF sheet.", 100, "Starting the browser download.");
        downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), fileName);
        showExportSuccessModal("PDF Export", fileName);
        setStatus("Exported the official-style PDF sheet.");
      } catch (error) {
        console.error("PDF export failed.", error);
        showExportFailureModal("PDF Export", error);
        setStatus(`PDF export failed: ${error?.message || "Unknown error."}`);
      }
    }
export async function exportSpreadsheetState() {
      try {
        setStatus("Loading spreadsheet export tools...");
        await ensureSpreadsheetRuntimeLoaded({ includeExportAssets: true });
        await updateSheetModalProgress("Preparing the filled spreadsheet workbook.", 5, "Gathering character fields and derived sheet values.");
        setStatus("Generating spreadsheet workbook...");
const portraitWasNormalized = await normalizeCurrentPortraitDataUrl();
        if (portraitWasNormalized) {
          await updateSheetModalProgress("Preparing the filled spreadsheet workbook.", 8, "Compressed an oversized portrait so the workbook metadata stays manageable.");
        }
const preparedExport = await prepareExportCache();
        await updateSheetModalProgress("Preparing the filled spreadsheet workbook.", 14, exportPrepCache.preparedAt ? "Using the prepared export cache for current character data." : "Prepared current character data for export.");
        await updateSheetModalProgress("Filling the spreadsheet workbook.", 24, "Loaded the Google-style template package and prepared workbook sheets.");
const cellMap = buildSpreadsheetExportCellMap(preparedExport);
        await updateSheetModalProgress("Filling the spreadsheet workbook.", 54, "Mapped identity, stats, skills, classes, abilities, breakthroughs, inventory, and notes.");
        await updateSheetModalProgress("Finalizing the spreadsheet workbook.", 78, "Patching the original workbook XML so formatting, forms, tables, and hidden setup stay intact.");
const spreadsheetBytes = await withTimeout(
          generateTemplateSpreadsheetWorkbook(cellMap, preparedExport.embeddedStatePackage),
          30000,
          "Spreadsheet workbook packaging timed out."
        );
        await updateSheetModalProgress("Finalizing the spreadsheet workbook.", 92, "Writing the workbook file for download.");
const fileName = `${preparedExport.fileStem}.xlsx`;
        await updateSheetModalProgress("Downloading the filled spreadsheet workbook.", 100, "Starting the browser download.");
        downloadBlob(
          new Blob([spreadsheetBytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          }),
          fileName
        );
        showExportSuccessModal("Spreadsheet Export", fileName);
        setStatus("Exported the Google-style spreadsheet workbook.");
      } catch (error) {
        console.error("Spreadsheet export failed.", error);
        showExportFailureModal("Spreadsheet Export", error);
        setStatus(`Spreadsheet export failed: ${error?.message || "Unknown error."}`);
      }
    }
async function importPdfState(file) {
      setStatus("Loading PDF import tools...");
      await ensurePdfRuntimeLoaded();
const pdfBytes = await readFileAsArrayBuffer(file);
const pdfDoc = await window.PDFLib.PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fieldMap = {};
      form.getFields().forEach((field) => {
        if (typeof field.getText !== "function") {
          return;
        }
        fieldMap[field.getName()] = field.getText();
      });
const embedded = await tryDecodeEmbeddedStatePackage(extractPdfEmbeddedPackage(fieldMap), "PDF embedded character data");
      if (embedded) {
        const didLoadEmbedded = loadSavedState(embedded, { activeSlotId: "", statusOnFailure: true });
        if (didLoadEmbedded) {
          await alignLoadedStateGameVersion({ statusLabel: `Imported ${file.name}` });
          setStatus(`Imported ${file.name}.`);
          return true;
        }
      }
const payload = buildPdfImportPayload(fieldMap);
const didLoad = loadSavedState(payload, { activeSlotId: "", statusOnFailure: true });
      if (didLoad) {
        await alignLoadedStateGameVersion({ statusLabel: `Imported ${file.name}` });
        setStatus(`Imported ${file.name}.`);
      }
      return didLoad;
    }
async function importSpreadsheetState(file) {
      setStatus("Loading spreadsheet import tools...");
      await ensureSpreadsheetRuntimeLoaded();
const workbook = window.XLSX.read(await readFileAsArrayBuffer(file), { type: "array" });
const embedded = await extractSpreadsheetMetadata(workbook);
      if (embedded) {
        const didLoadEmbedded = loadSavedState(embedded, { activeSlotId: "", statusOnFailure: true });
        if (didLoadEmbedded) {
          await alignLoadedStateGameVersion({ statusLabel: `Imported ${file.name}` });
          setStatus(`Imported ${file.name}.`);
          return true;
        }
      }
const payload = buildSpreadsheetImportPayload(workbook);
const didLoad = loadSavedState(payload, { activeSlotId: "", statusOnFailure: true });
      if (didLoad) {
        await alignLoadedStateGameVersion({ statusLabel: `Imported ${file.name}` });
        setStatus(`Imported ${file.name}.`);
      }
      return didLoad;
    }
export async function handleImportedCharacterFile(file) {
      const lowerName = String(file?.name || "").toLowerCase();
      if (lowerName.endsWith(".json")) {
        const raw = await readFileAsText(file);
        if (loadSavedState(raw, { activeSlotId: "", statusOnFailure: true })) {
          await alignLoadedStateGameVersion({ statusLabel: `Imported ${file.name}` });
          setStatus(`Imported ${file.name}.`);
          return true;
        }
        return false;
      }
      if (lowerName.endsWith(".pdf")) {
        return importPdfState(file);
      }
      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        return importSpreadsheetState(file);
      }
      setStatus("Unsupported import format.");
      return false;
    }
function openExportModal() {
      openSheetModal({
        eyebrow: "Export Character",
        title: "Choose Export Format",
        lead: "Export the current character as raw JSON, as the official-style PDF sheet, or as a filled spreadsheet workbook.",
        content: `
          <div class="sheet-modal-option-grid">
            <button type="button" class="sheet-modal-option" data-export-mode="json">
              <strong>JSON File</strong>
              <span>Exports the complete internal save data for exact round-tripping.</span>
            </button>
            <button type="button" class="sheet-modal-option" data-export-mode="pdf">
              <strong>PDF Character Sheet</strong>
              <span>Builds the official-style six-page sheet with your current data filled in.</span>
            </button>
            <button type="button" class="sheet-modal-option" data-export-mode="spreadsheet">
              <strong>Spreadsheet Workbook</strong>
              <span>Fills the provided Google-style spreadsheet template and embeds the full state for import.</span>
            </button>
          </div>
        `
      });
    }
export function saveToBrowser() {
      openSaveSlotModal();
    }
export function loadFromBrowser() {
      openLoadSavedModal();
    }
export function exportJsonState() {
      const payload = JSON.stringify(createStateSnapshot(), null, 2);
      downloadBlob(new Blob([payload], { type: "application/json" }), `${buildExportFileStem()}.json`);
      closeSheetModal();
      setStatus("Exported character JSON.");
    }
export function exportState() {
      openExportModal();
    }
function addClassFromBrowser() {
      const classData = getClassDetail(document.getElementById("class-browser").value);
      if (!classData) {
        return;
      }
      if (!state.builder.selectedClassIds.includes(classData.id) && state.builder.selectedClassIds.length >= CLASS_ROWS.length) {
        setStatus("No empty class rows left.");
        return;
      }
      if (!state.builder.selectedClassIds.includes(classData.id)) {
        state.builder.selectedClassIds.push(classData.id);
      }
      state.builder.inspected.class = classData.id;
      syncBuilderSelectionsIntoSheet();
      renderBuilder();
      setStatus(`Added ${classData.name} to the class list.`);
    }
function addItemFromBrowser() {
      const item = lookup.items.resolve(document.getElementById("item-browser").value);
      if (!item) {
        return;
      }
const cost = parseClimCost(item.cost);
const funds = getStartingFundsState();
const selected = state.builder.selectedItemIds.includes(item.id);
const stackable = Boolean(item.id);
      if ((!selected || stackable) && cost > 0 && cost > funds.availableClim) {
        setStatus(`${item.name} costs ${cost} Clim, but only ${funds.availableClim} Clim remains.`);
        return;
      }
      if (!selected && state.builder.selectedItemIds.length >= INVENTORY_ROWS.length) {
        setStatus("No empty combat inventory rows left.");
        return;
      }
      if (!state.builder.itemQuantities || typeof state.builder.itemQuantities !== "object") {
        state.builder.itemQuantities = {};
      }
      if (!selected) {
        state.builder.selectedItemIds.push(item.id);
      }
      const currentQuantity = Math.max(0, Math.floor(Number(state.builder.itemQuantities[item.id] || (selected ? 1 : 0))));
      state.builder.itemQuantities[item.id] = stackable ? currentQuantity + 1 : 1;
      state.builder.inspected.item = item.id;
      syncBuilderSelectionsIntoSheet();
      renderBuilder();
      setStatus(stackable ? `Added ${item.name} to the inventory list. Quantity: ${state.builder.itemQuantities[item.id]}.` : `Added ${item.name} to the inventory list.`);
    }
function appendItemNotes() {
      const item = lookup.items.resolve(document.getElementById("item-browser").value);
      if (!item) {
        return;
      }
const block = [item.name, [item.type, item.subType, item.cost, item.burden].filter(Boolean).join(" | "), item.description].filter(Boolean).map(cleanText).join("\n");
      appendFieldText("Items", block);
    }
function addBreakthroughFromBrowser() {
      const breakthrough = lookup.breakthroughs.resolve(document.getElementById("breakthrough-browser").value);
      if (!breakthrough) {
        return;
      }
const requirementStatus = getBreakthroughRequirementStatus(breakthrough);
      if (!requirementStatus.met) {
        setStatus(`${breakthrough.name} is locked. ${requirementStatus.reasons.join(" ")}`);
        return;
      }
const budget = getBreakthroughBudgetState();
const nextCost = Math.max(0, parseNumericCost(breakthrough.cost));
      if (!state.builder.selectedBreakthroughIds.includes(breakthrough.id) && nextCost > budget.remaining) {
        setStatus(`${breakthrough.name} costs ${nextCost} EXP, but only ${budget.remaining} remains across creation breakthrough EXP and normal XP.`);
        return;
      }
      if (!state.builder.selectedBreakthroughIds.includes(breakthrough.id)) {
        state.builder.selectedBreakthroughIds.push(breakthrough.id);
      }
      state.builder.inspected.breakthrough = breakthrough.id;
      syncBuilderSelectionsIntoSheet();
      renderBuilder();
      setStatus(`Added ${breakthrough.name} to the breakthrough list.`);
    }
function fillFocusedAbilityFromBrowser() {
      const ability = lookup.abilities.resolve(document.getElementById("ability-browser").value);
      if (!ability || !state.lastFocusedField || !/^Ability\d+$/.test(state.lastFocusedField)) {
        setStatus("Focus an ability slot first.");
        return;
      }
      fillAbilityField(state.lastFocusedField, ability);
    }
function fillFirstAbilityFromBrowser() {
      const ability = lookup.abilities.resolve(document.getElementById("ability-browser").value);
      if (!ability) {
        return;
      }
const target = firstEmptyField(/^Ability\d+$/);
      if (!target) {
        setStatus("No empty ability fields left.");
        return;
      }
      fillAbilityField(target, ability);
    }


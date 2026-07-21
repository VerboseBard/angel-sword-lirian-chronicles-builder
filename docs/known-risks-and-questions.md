# Known Risks And Open Questions

## Physical-device coverage

Automated Chromium, Firefox, and WebKit tests cover desktop and phone-sized viewports, but they do not measure thermal load, battery use, memory pressure, touch latency, home-screen installation, or browser-specific privacy settings on physical devices.

Before calling a release fully device-certified, check:

- current and older supported iPhones in Safari
- representative low- and mid-range Android phones in Chrome
- Brave with Shields enabled
- Firefox Android
- Edge and Chrome on Windows

## PWA artwork

The 512 px icon is derived from a smaller source mark and may look soft on high-density devices. Replace it when a true high-resolution source is available.

## Official-source contradictions

Rules 0.13.1 say Selkie's Aqua Drill and Water Mastery were replaced by Blue Soul, while one live detail still references Aqua Drill. The builder preserves the pulled text and records the discrepancy. Do not invent a replacement without an official ruling.

## Save durability

Browser storage belongs to one browser profile and may be cleared by the user, privacy settings, or the operating system. Encourage exported backups. Any storage-key or record-ID change needs an explicit migration and legacy fixture.

## Historical rules

Older rules packages are required for existing characters. New logic must be version-aware when wording or costs differ. Test 0.12.5, 0.12.6, 0.13.0, and 0.13.1 after changes to prerequisites, grants, Quick Builds, or derived values.

## Remaining questions

- What is the oldest Safari/iOS version the public release promises to support beyond the enforced Safari 15 syntax target?
- Which physical Android devices should become the repeatable low-end performance baseline?
- Should a future release add an explicit export-backup reminder for long-lived browser-only characters?
- When will high-resolution logo and PWA icon source artwork be available?

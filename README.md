# Nubra AI Assistant Extension

A Chrome extension to convert broker strategy code to Nubra SDK and chat for integration help.

## Install (Unpacked)
1. Download this repository as ZIP from GitHub, or clone it.
2. Extract the folder.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on `Developer mode` (top-right).
5. Click `Load unpacked`.
6. Select this project folder (the folder that contains `manifest.json`).

## Use
1. Open any webpage.
2. Click the Nubra floating button to open the assistant.
3. Choose a mode:
   - `Code Convert`: paste broker code for conversion.
   - `Chat`: ask Nubra SDK questions.

## Requirements
- Internet connection (extension calls the hosted backend).
- Chrome browser (latest stable recommended).

## Troubleshooting
- Extension not visible: refresh `chrome://extensions` and re-load unpacked.
- Backend not responding: verify the deployed backend is live and retry.
- UI not updating after changes: click `Reload` on the extension card and refresh the page.

## Security
- API keys are not stored in this extension repo.
- Backend secrets are managed on Vercel environment variables.

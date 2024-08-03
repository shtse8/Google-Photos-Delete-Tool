# Google Photos Delete Tool

This tool provides an efficient, stable, and automated way to delete multiple photos from Google Photos. Unlike other scripts or manual methods, this tool offers several unique features:

- **Selector-based Awaiting**: Instead of using timers, this script uses selectors to await elements, ensuring optimal performance and stability across different network speeds and device capabilities.
- **Automatic Scrolling**: The script automatically scrolls through your entire photo library, eliminating the need for manual intervention.
- **Batch Processing**: Photos are selected and deleted in batches, significantly speeding up the deletion process.
- **Customizable Deletion Limit**: Users can easily set a maximum number of photos to delete, providing fine-grained control over the operation.
- **Resilient to Interruptions**: If the script stops unexpectedly, it can be restarted and will continue from where it left off.

This improved version offers a more reliable and efficient solution for users looking to manage large numbers of photos in their Google Photos account.

![Google Photos Delete Tool in Action](images/tool-in-action.png)
*Image: Screenshot of the Google Photos Delete Tool selecting and deleting photos*

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)
- [Caution](#caution)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Contributing](#contributing)
- [License](#license)

## Prerequisites

- A modern web browser (tested on Google Chrome, but should work on others)
- Access to the [English version of Google Photos](https://photos.google.com/?hl=en)

## Installation

1. Clone this repository or download the `delete_photos.js` file:
   ```
   git clone https://github.com/your-username/google-photos-delete-tool.git
   ```
   Or download the script directly: [delete_photos.js](https://raw.githubusercontent.com/your-username/google-photos-delete-tool/main/delete_photos.js)

2. No additional installation is required as the script runs directly in your browser's console.

## Usage

1. Log into your Google Account and navigate to [Google Photos](https://photos.google.com/?hl=en).

   ![Google Photos Homepage](images/google-photos-homepage.png)
   *Image: Screenshot of Google Photos homepage*

2. Open your browser's Developer Tools:
   - Chrome/Edge: Press `Ctrl + Shift + I` (Windows/Linux) or `Cmd + Option + I` (Mac)
   - Firefox: Press `Ctrl + Shift + K` (Windows/Linux) or `Cmd + Option + K` (Mac)

   ![Developer Tools Console](images/dev-tools-console.png)
   *Image: Screenshot of browser's Developer Tools with Console tab open*

3. Switch to the "Console" tab in the Developer Tools.

4. Copy the entire content of the `delete_photos.js` file.

5. Paste the code into the console and press Enter to run the script.

   ![Script in Console](images/script-in-console.png)
   *Image: Screenshot of the script pasted into the browser console*

6. The script will start selecting and deleting photos automatically. You'll see progress updates in the console.

   ![Script Running](images/script-running.png)
   *Image: Screenshot of the script running with console output*

## Customization

You can adjust the `maxCount` variable at the beginning of the script to set the maximum number of photos to delete. By default, it's set to 10,000.

```javascript
const maxCount = 10000; // Change this number to your desired limit
```

## Troubleshooting

If you encounter any issues:

1. Ensure you're using the English version of Google Photos.
2. Try refreshing the page and running the script again.
3. If the script stops unexpectedly, you can simply run it again to continue the process.
4. Check the browser console for any error messages and report them if the issue persists.

## Caution

- Use this script responsibly. Deleted photos may be recoverable for a limited time, but exercise caution to avoid unintended data loss.
- This script interacts with the Google Photos interface, which may change over time. If Google updates their UI, the script may need adjustments.
- Always ensure you have backups of important photos before performing bulk deletions.

## Frequently Asked Questions

1. **Q: Is this tool safe to use?**
   A: While the tool is designed to be safe, always use caution when bulk deleting files. Ensure you have backups of important photos.

2. **Q: Can I recover photos deleted by this tool?**
   A: Google Photos typically keeps deleted items in the trash for 60 days. You can recover them from there within this period.

3. **Q: Why does the script sometimes pause or slow down?**
   A: The script may slow down due to network latency or Google Photos' rate limiting. It's designed to handle these situations gracefully.

## Contributing

Contributions are welcome! If you have suggestions for improvements or encounter any problems, please:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer:** This tool is not officially associated with Google. Use it at your own risk. The developers are not responsible for any data loss or account issues resulting from the use of this script.

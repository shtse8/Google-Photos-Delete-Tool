# Google Photos Delete Tool

This tool provides an efficient, stable, and automated way to delete multiple photos from Google Photos. Unlike other scripts or manual methods, this tool offers several unique features:

- **Selector-based Awaiting**: Instead of using timers, this script uses selectors to await elements, ensuring optimal performance and stability across different network speeds and device capabilities.
- **Automatic Scrolling**: The script automatically scrolls through your entire photo library, eliminating the need for manual intervention.
- **Batch Processing**: Photos are selected and deleted in batches, significantly speeding up the deletion process.
- **Customizable Deletion Limit**: Users can easily set a maximum number of photos to delete, providing fine-grained control over the operation.
- **Resilient to Interruptions**: If the script stops unexpectedly, it can be restarted and will continue from where it left off.

This improved version offers a more reliable and efficient solution for users looking to manage large numbers of photos in their Google Photos account.

## Table of Contents

- [Prerequisites](#prerequisites)
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

## Usage

1. [Login to your Google Account](https://accounts.google.com/ServiceLogin).

   ![Google Account Sign-in Page](images/google-signin-page.jpg)

2. Go to [Google Photos](https://photos.google.com/?hl=en)

   ![Google Photos Page](images/google-photos-page.jpg)

3. Disable image loading for Google Photos on your browser to avoid high CPU, RAM, and network usage:

   - On Chrome:
     1. Click on the site padlock (the lock icon along the URL bar) -> Site settings
     2. Block images in the Permissions for the website

   ![Image Blocking in Chrome](images/image_block.png)

   3. Reload Google Photos

4. Open Developer Tools. You can do this by:

   - **Keyboard Shortcut**: Press `CTRL + SHIFT + I`
   - **From the Page**: Right-click on an empty area and select `Inspect` (last option)

   ![Google Chrome Right Click Pop-up Menu](images/chrome-popup-menu.jpg)

   - **From Menu**: 
     1. Click on the menu button ![Google Chrome Menu Icon](images/chrome-menu-icon.jpg) on Google Chrome
     2. Select `More tools`
     3. Select `Developer tools`

   ![Google Chrome Menu Developer Tools](images/chrome-menu-popup.jpg)

5. After opening the developer tools, click on the `Console` tab.

   ![Google Chrome Console on Google Photos page](images/chrome-console.jpg)

6. Copy all the code from the `delete_photos.js` file and paste it into the console.

   ![The Code in Chrome Console](images/code-in-console.jpg)

7. Hit **ENTER** after pasting the script in the console. The script will start running upon hitting the ENTER key.

8. The script will start selecting and deleting photos automatically. You'll see progress updates in the console.

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

Contributions are welcome! If you have suggestions for improvements or encounter any problems, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer:** This tool is not officially associated with Google. Use it at your own risk. The developers are not responsible for any data loss or account issues resulting from the use of this script.

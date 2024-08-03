# Google Photos Delete All Tool

If you have ever wanted to delete thousands of photos from [Google Photos](https://photos.google.com/) but failed to find an easy way to do so, then this is the tool for you. This script automates the deletion process, providing a visual representation as it happens!

## Getting Started

Follow the step-by-step instructions below to run the tool.

### Prerequisites

- A modern web browser, preferably Google Chrome. You can [download the latest version of Google Chrome here](https://www.google.com/chrome/).

- Use the [English language version of Google Photos](https://photos.google.com/?hl=en).

### Assumptions

These steps are written for Google Chrome. If you're using a different browser, the steps are similar, but specific shortcuts or keywords may vary.

### Steps

1. **Login to your Google Account**: Go to the [Google Account Sign-in Page](https://accounts.google.com/ServiceLogin).

2. **Navigate to Google Photos**: Go to [Google Photos](https://photos.google.com/?hl=en).

3. **Disable Image Loading** (Optional but recommended to reduce CPU, RAM, and network usage):
   - **On Chrome**:
     1. Click on the padlock icon next to the URL bar and select "Site settings".
     2. Block images under the "Permissions" section.
     3. Reload Google Photos.

4. **Open Developer Tools**:
   - **Keyboard Shortcut**: Press `CTRL + SHIFT + I`.
   - **Right Click on Page**: Select `Inspect`.
   - **From Menu**: Click the menu button (three dots), select `More tools`, then `Developer tools`.

5. **Open the Console Tab**:
   - Click on the `Console` tab in the Developer Tools.

6. **Copy and Paste the Script**:
   - Copy the entire code from the `delete_photos.js` file and paste it into the console.
   - Press **ENTER** to run the script.

7. **Run the Script**:
   - The script will start running upon hitting ENTER. It will select and delete photos in batches until all photos are deleted.

### Advanced Options

To delete a specific number of photos, modify the value of `maxCount` in the script.

### Debugging

- If the script doesn't delete photos, ensure you are using the [English language version of Google Photos](https://photos.google.com/?hl=en).
- If it stops after deleting some images, simply paste the script again and press ENTER. The script will continue the operation.
- For slow internet connections, the script will automatically wait for elements to be available before proceeding, ensuring stable operation.

### FAQs

1. **It checks and unchecks the photos, but doesn't delete them.**
   - Ensure you are using the [English language version of Google Photos](https://photos.google.com/?hl=en) and run the tool again.

2. **It stops after deleting some images.**
   - Simply paste the script again and hit ENTER. The script will continue deleting photos.

3. **There was a delay in loading images and the tool exited.**
   - In this case, you can paste the script again and hit ENTER. The script will resume the operation from where it left off.

### Conclusion

This script provides a reliable and efficient way to delete all photos from Google Photos. By using selectors to await elements, it ensures optimal performance and stability, making it a powerful tool for managing your photo library.

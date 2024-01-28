const maxCount = 5000;
const counterSelector = '.rtExYb';
const checkboxSelector = '.ckGgle[aria-checked=false]';
const photoDivSelector = ".yDSiEe.uGCjIb.zcLWac.eejsDc.TWmIyd";
const deleteButtonSelector = 'button[aria-label="Delete"]';
const confirmationButtonSelector = '#yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.V639qd.bvQPzd.oEOLpc.Up8vH.J9Nfi.A9Uzve.iWO5td > div.XfpsVe.J9fJmf > button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.kHssdc.HvOprf';

async function deleteGooglePhotos() {
    // Retrieves the current count of selected photos
    const getCount = () => {
        const counterElement = document.querySelector(counterSelector);
        return counterElement ? parseInt(counterElement.textContent) || 0 : 0;
    };

    // Waits for a specified time
    const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

    // Scrolls the photo list down
    const scrollPhotoList = async () => {
        let photoDiv = document.querySelector(photoDivSelector)
	let top = photoDiv.scrollTop;
	await waitUntil(() => {
	    photoDiv.scrollBy(0, photoDiv.clientHeight);
            return photoDiv.scrollTop > top;
        });
    };

    // Scrolls the photo list to the top
    const scrollPhotoListTo = (top = 0) => {
        document.querySelector(photoDivSelector).scrollTop = top;
    };

    // Scrolls the photo list to the top
    const scrollPhotoListBy = async (height = 0) => {
	const photoDiv = document.querySelector(photoDivSelector);
	await waitUntil(() => {
            const top = photoDiv.scrollTop;
            photoDiv.scrollBy(0, height);
            return photoDiv.scrollTop == top + height
        });
    };

    // Waits until a specific condition is met, then returns the result
    const waitUntil = async (resultFunction, conditionFunction = x => x, timeout = 600000) => {
        let startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            let result = await resultFunction();
            if (conditionFunction(result)) return result;
            await wait(300);
        }
        throw new Error("Timeout reached");
    };

    // Handles the deletion of selected photos
    const deleteSelected = async () => {
        let count = getCount();
        if (count <= 0) return;
        console.log("Deleting " + count);

        const deleteButton = document.querySelector(deleteButtonSelector);
        deleteButton.click();

        const confirmation_button = await waitUntil(() => document.querySelector(confirmationButtonSelector));
        confirmation_button.click();

        await waitUntil(() => getCount() === 0);
        scrollPhotoListTo(0);
    };

    // Main loop to select and delete photos
    while (true) {
        try {
            const checkboxes = await waitUntil(
                () => [...document.querySelectorAll(checkboxSelector)], 
                x => x.length > 0
            );
            let count = getCount();
            let targetCheckboxes = checkboxes.slice(0, maxCount - count);
            targetCheckboxes.forEach(x => x.click());
            await wait(200);
            count = getCount();
            console.log("Selected " + count);

            if (count >= maxCount) {
                await deleteSelected();
            } else {
                let rect = targetCheckboxes[targetCheckboxes.length - 1].getBoundingClientRect();
                let height = rect.top;
                scrollPhotoListBy(height);
            }
        } catch (e) {
            console.log(e);
            break; // Break out of the loop if a timeout occurs
        }
    }

    // Final deletion for any remaining photos
    await deleteSelected();

    console.log('End of deletion process');
}

await deleteGooglePhotos();

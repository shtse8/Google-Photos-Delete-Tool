(async function() {
  const CONFIG = {
    maxCount: 10000,
    selectors: {
      counter: ".rtExYb",
      checkbox: ".ckGgle[aria-checked=false]",
      photoDiv: ".yDSiEe.uGCjIb.zcLWac.eejsDc.TWmIyd",
      deleteButton: 'button[aria-label="Delete"]',
      confirmationButton: ".VfPpkd-T0kwCb  button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.AjY5Oe.LQeN7.kDryjd"
    },
    timeout: 600000,
    scrollDelay: 300
  };

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const waitUntil = async (condition, timeout = CONFIG.timeout) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) return result;
      await wait(CONFIG.scrollDelay);
    }
    throw new Error("Timeout reached");
  };

  const getElement = (selector) => document.querySelector(selector);
  const getElements = (selector) => [...document.querySelectorAll(selector)];

  const getCount = () => {
    const counterElement = getElement(CONFIG.selectors.counter);
    return counterElement ? parseInt(counterElement.textContent, 10) || 0 : 0;
  };

  const scrollPhotoList = async () => {
    const photoDiv = getElement(CONFIG.selectors.photoDiv);
    const initialTop = photoDiv.scrollTop;
    await waitUntil(() => {
      photoDiv.scrollBy(0, photoDiv.clientHeight);
      return photoDiv.scrollTop > initialTop;
    });
  };

  const scrollPhotoListTo = (top = 0) => {
    getElement(CONFIG.selectors.photoDiv).scrollTop = top;
  };

  const scrollPhotoListBy = async (height = 0) => {
    const photoDiv = getElement(CONFIG.selectors.photoDiv);
    await waitUntil(() => {
      const initialTop = photoDiv.scrollTop;
      photoDiv.scrollBy(0, height);
      return waitUntil(() => getElement(CONFIG.selectors.checkbox), 500)
        .catch(() => null);
    });
  };

  const deleteSelected = async () => {
    const count = getCount();
    if (count <= 0) return;

    console.log(`Deleting ${count} photos`);
    getElement(CONFIG.selectors.deleteButton).click();

    const confirmationButton = await waitUntil(() => 
      getElement(CONFIG.selectors.confirmationButton)
    );
    confirmationButton.click();

    await waitUntil(() => getCount() === 0);
    scrollPhotoListTo(0);
  };

  const selectPhotos = async () => {
    const checkboxes = await waitUntil(() => {
      const elements = getElements(CONFIG.selectors.checkbox);
      return elements.length > 0 ? elements : null;
    });

    const currentCount = getCount();
    const targetCheckboxes = checkboxes.slice(0, CONFIG.maxCount - currentCount);
    targetCheckboxes.forEach(checkbox => checkbox.click());

    await wait(200);
    const newCount = getCount();
    console.log(`Selected ${newCount} photos`);

    return { newCount, lastCheckbox: targetCheckboxes[targetCheckboxes.length - 1] };
  };

  async function deleteGooglePhotos() {
    try {
      while (true) {
        const { newCount, lastCheckbox } = await selectPhotos();

        if (newCount >= CONFIG.maxCount) {
          await deleteSelected();
        } else {
          const { top } = lastCheckbox.getBoundingClientRect();
          await scrollPhotoListBy(top);
        }
      }
    } catch (error) {
      console.error("An error occurred:", error);
    } finally {
      await deleteSelected();
      console.log("End of deletion process");
    }
  }

  await deleteGooglePhotos();
})();

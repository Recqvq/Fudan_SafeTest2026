const TARGET_URL =
  "https://lsem.fudan.edu.cn/fd_aqks_new/examProgress/examBase/examIndex";

const startButton = document.getElementById("start");
const status = document.getElementById("status");

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status.textContent = "正在打开考试页面……";

  await chrome.storage.local.set({ fudanSafeTestAutoRun: Date.now() });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "没有找到当前标签页。";
    startButton.disabled = false;
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "FUDAN_SAFE_TEST_START",
    });
    if (response?.started) {
      status.textContent = "已开始，请查看网页右上角状态。";
      return;
    }
  } catch (_) {
    // The current page is not the exam site yet; navigate it below.
  }

  await chrome.tabs.update(tab.id, { url: TARGET_URL });
  status.textContent = "请在网页中完成登录，之后会自动继续。";
});

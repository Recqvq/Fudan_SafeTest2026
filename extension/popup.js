const EXAM_TARGET_URL =
  "https://lsem.fudan.edu.cn/fd_aqks_new/examProgress/examBase/examIndex";
const COURSE_TARGET_URL =
  "https://lsem.fudan.edu.cn/fd_aqks_new/examProgress/examOnline/examProgressOnlineIndex?isSchool=1";

const startButton = document.getElementById("start");
const coursesButton = document.getElementById("courses");
const stopCoursesButton = document.getElementById("stop-courses");
const status = document.getElementById("status");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status.textContent = "正在打开考试页面……";

  await chrome.storage.local.remove("fudanSafeTestCourseRun");
  await chrome.storage.local.set({ fudanSafeTestAutoRun: Date.now() });
  const tab = await activeTab();
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

  await chrome.tabs.update(tab.id, { url: EXAM_TARGET_URL });
  status.textContent = "请在网页中完成登录，之后会自动继续。";
});

coursesButton.addEventListener("click", async () => {
  coursesButton.disabled = true;
  status.textContent = "正在打开课程列表……";

  const startedAt = Date.now();
  await chrome.storage.local.remove("fudanSafeTestAutoRun");
  await chrome.storage.local.set({
    fudanSafeTestCourseRun: {
      startedAt,
      phase: "detecting",
      phaseStartedAt: startedAt,
      visited: [],
    },
  });

  const tab = await activeTab();
  if (!tab?.id) {
    status.textContent = "没有找到当前标签页。";
    coursesButton.disabled = false;
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "FUDAN_SAFE_COURSE_START",
    });
    if (response?.started) {
      status.textContent = "已开始，请查看网页右上角状态。";
      return;
    }
  } catch (_) {
    // The current page is not the course site yet; navigate it below.
  }

  await chrome.tabs.update(tab.id, { url: COURSE_TARGET_URL });
  status.textContent = "请在网页中完成登录，之后会自动继续。";
});

stopCoursesButton.addEventListener("click", async () => {
  await chrome.storage.local.remove("fudanSafeTestCourseRun");
  const tab = await activeTab();
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "FUDAN_SAFE_COURSE_STOP" });
    } catch (_) {
      // The active tab may not be the course site; clearing storage is sufficient.
    }
  }
  coursesButton.disabled = false;
  status.textContent = "课程自动阅读已停止。";
});

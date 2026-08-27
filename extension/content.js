(() => {
  if (globalThis.__fudanSafeTestLoaded) return;
  globalThis.__fudanSafeTestLoaded = true;

  const AUTO_RUN_KEY = "fudanSafeTestAutoRun";
  const COURSE_RUN_KEY = "fudanSafeTestCourseRun";
  const COURSE_SESSION_KEY = "fudanSafeTestCourseSession";
  const COURSE_RUN_MAX_AGE = 24 * 60 * 60 * 1000;
  const MAX_QUESTIONS = 200;
  const MAX_COURSES = 200;
  let examRunning = false;
  let courseRunning = false;

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  function normalize(text) {
    return String(text || "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, "")
      .trim();
  }

  function rendered(element) {
    return Boolean(
      element &&
        element.getClientRects().length &&
        getComputedStyle(element).visibility !== "hidden"
    );
  }

  function visible(element) {
    return Boolean(
      rendered(element) &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true" &&
        !element.classList.contains("disabled") &&
        !element.classList.contains("is-disabled")
    );
  }

  function controlText(element) {
    return normalize(element.innerText || element.value || element.textContent);
  }

  function findControl(labels, selectors = ["button", "a"]) {
    const wanted = new Set(labels.map(normalize));
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (visible(element) && wanted.has(controlText(element))) return element;
      }
    }
    return null;
  }

  async function waitFor(check, timeout = 30000, interval = 250) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await sleep(interval);
    }
    throw new Error("等待页面元素超时");
  }

  function statusPanel() {
    let panel = document.getElementById("fudan-safe-test-status");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "fudan-safe-test-status";
    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "2147483647",
      top: "16px",
      right: "16px",
      maxWidth: "420px",
      padding: "12px 15px",
      borderRadius: "10px",
      boxShadow: "0 8px 28px rgba(0,0,0,.22)",
      color: "#fff",
      background: "#155eef",
      font: '14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
      whiteSpace: "pre-wrap",
    });
    document.documentElement.appendChild(panel);
    return panel;
  }

  function setStatus(message, kind = "working") {
    const panel = statusPanel();
    panel.textContent = message;
    panel.style.background =
      kind === "error" ? "#b42318" : kind === "done" ? "#267a42" : "#155eef";
  }

  function readableText(element) {
    return String(element?.innerText || element?.value || element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readingCompleteControl() {
    const labels = new Set(["阅读完成", "完成阅读"].map(normalize));
    const selector =
      'button, a, input[type="button"], input[type="submit"], [role="button"], [onclick], .btn, .el-button, .layui-btn';
    for (const element of document.querySelectorAll(selector)) {
      const text = controlText(element);
      if (rendered(element) && [...labels].some((label) => text.includes(label))) return element;
    }
    return null;
  }

  function remainingSeconds(root = document.body) {
    const text = readableText(root);
    const minuteSecond = text.match(
      /剩余时间\s*[:：]?\s*(\d+)\s*分\s*(\d+)\s*秒/i
    );
    if (minuteSecond) {
      return Number(minuteSecond[1]) * 60 + Number(minuteSecond[2]);
    }
    const patterns = [
      /剩余时间\s*[:：]?\s*(\d+)\s*(?:秒|s)/i,
      /还需(?:阅读|学习)?\s*(\d+)\s*(?:秒|s)/i,
      /(\d+)\s*(?:秒|s)\s*后(?:可|才能)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function readingState() {
    const complete = readingCompleteControl();
    let seconds = null;
    if (complete) {
      let container = complete;
      for (let depth = 0; container && depth < 6; depth += 1) {
        seconds = remainingSeconds(container);
        if (seconds !== null) break;
        container = container.parentElement;
      }
    }
    if (seconds === null) seconds = remainingSeconds();
    return complete || seconds !== null ? { complete, seconds } : null;
  }

  function courseContainer(element) {
    let current = element;
    let fallback = element.parentElement || element;
    for (let depth = 0; current && depth < 6; depth += 1) {
      const text = readableText(current);
      if (text.length > readableText(element).length && text.length < 800) {
        fallback = current;
      }
      if (
        current.matches("li, tr, article, .card, .item, .course, .course-item, .lesson-item") ||
        (text.length < 800 && /未完成|未学习|未阅读|学习中|已完成|已学习/.test(text))
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return fallback;
  }

  function courseKey(element, container) {
    const action = [
      element.getAttribute("href"),
      element.getAttribute("onclick"),
      element.getAttribute("data-id"),
      element.getAttribute("data-course-id"),
      element.id,
    ]
      .filter(Boolean)
      .join("|");
    const context = normalize(readableText(container))
      .replace(/未完成|未学习|未阅读|学习中|已完成|已学习|开始学习|继续学习|进入学习/g, "")
      .slice(0, 300);
    return `${action || element.tagName}|${context}`;
  }

  function courseCandidates() {
    const selector = [
      "button",
      "a",
      '[role="button"]',
      '[onclick]',
      ".btn",
      ".el-button",
      ".layui-btn",
    ].join(",");
    const results = [];
    const keys = new Set();

    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element) || element.closest("#fudan-safe-test-status")) continue;
      const label = readableText(element);
      const container = courseContainer(element);
      const context = readableText(container);
      const attributes = [
        element.getAttribute("href"),
        element.getAttribute("onclick"),
        element.className,
      ]
        .filter(Boolean)
        .join(" ");

      if (/考试|答题|考场|交卷|提交|阅读完成|完成阅读/.test(label)) continue;
      if (/已完成|已学习|100%/.test(context) && !/未完成/.test(context)) continue;

      const contextLooksPending = /未完成|未学习|未阅读|待学习|学习中/.test(context);
      const normalizedLabel = normalize(label);
      const labelLooksLikeCourse =
        /^(?:开始|继续|进入|去|点击|查看|打开)(?:学习|阅读|课程|观看|课程学习|在线学习)$/.test(
          normalizedLabel
        ) ||
        /开始学习|继续学习|进入学习|去学习|开始阅读|继续阅读/.test(label) ||
        (contextLooksPending &&
          /^(?:学习|阅读|课程|观看|课程学习|在线学习|进入|查看|打开|详情|点击进入)$/.test(
            normalizedLabel
          ));
      const actionLooksLikeCourse = /course|study|learn|lesson|read|video|resource|material/i.test(
        attributes
      );
      const pendingClickableCard = contextLooksPending && element === container;
      const pendingCourseLink =
        contextLooksPending &&
        Boolean(label) &&
        element.matches('a, button, [role="button"], [onclick]');

      if (
        !labelLooksLikeCourse &&
        !(contextLooksPending && actionLooksLikeCourse) &&
        !pendingClickableCard &&
        !pendingCourseLink
      ) {
        continue;
      }

      const key = courseKey(element, container);
      if (keys.has(key)) continue;
      keys.add(key);
      results.push({ element, container, key, title: context.slice(0, 80) || label });
    }
    return results;
  }

  function allCoursesLookComplete() {
    const text = readableText(document.body);
    return /全部(?:课程)?(?:学习|阅读)?完成|所有(?:课程)?(?:均)?已完成|已完成全部课程/.test(text);
  }

  async function getCourseRunState() {
    const stored = await chrome.storage.local.get(COURSE_RUN_KEY);
    const state = stored[COURSE_RUN_KEY];
    if (!state || typeof state.startedAt !== "number") return null;
    if (Date.now() - state.startedAt > COURSE_RUN_MAX_AGE) return null;
    return {
      startedAt: state.startedAt,
      phase: state.phase || "detecting",
      phaseStartedAt: state.phaseStartedAt || state.startedAt,
      visited: Array.isArray(state.visited) ? state.visited : [],
    };
  }

  async function saveCourseRunState(state) {
    sessionStorage.setItem(COURSE_SESSION_KEY, "1");
    await chrome.storage.local.set({ [COURSE_RUN_KEY]: state });
  }

  async function clearCourseRun() {
    courseRunning = false;
    sessionStorage.removeItem(COURSE_SESSION_KEY);
    await chrome.storage.local.remove(COURSE_RUN_KEY);
  }

  async function finishCurrentCourse(control, state) {
    state.phase = "closing";
    state.phaseStartedAt = Date.now();
    await saveCourseRunState(state);
    setStatus("计时已结束，正在滚动到“阅读完成”……");
    control.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    await sleep(600);
    setStatus("正在点击“阅读完成”……");
    control.click();
    await waitFor(
      () => !control.isConnected || !rendered(control) || !readingCompleteControl(),
      30000,
      500
    );
    state.phase = "list";
    state.phaseStartedAt = Date.now();
    await saveCourseRunState(state);
  }

  async function openNextCourse(state) {
    const visited = new Set(state.visited);
    const next = courseCandidates().find((candidate) => !visited.has(candidate.key));
    if (!next) return false;

    state.visited = [...visited, next.key].slice(-MAX_COURSES);
    state.phase = "opening";
    state.phaseStartedAt = Date.now();
    await saveCourseRunState(state);
    setStatus(`正在打开下一门课程：\n${next.title}`);

    if (next.element instanceof HTMLAnchorElement && next.element.target === "_blank") {
      next.element.target = "_self";
    }
    next.element.click();
    return true;
  }

  async function runCourses() {
    if (courseRunning) return;
    courseRunning = true;
    let zeroSeenAt = 0;
    let emptySeenAt = 0;

    try {
      let state = await getCourseRunState();
      if (!state) throw new Error("课程自动运行请求已失效，请重新点击扩展");

      while (courseRunning) {
        const reading = readingState();
        if (reading) {
          state.phase = "reading";
          state.phaseStartedAt = Date.now();

          if (reading.seconds === null) {
            setStatus("已进入课程，正在等待网站显示剩余时间……");
            await sleep(1000);
            continue;
          }

          if (reading.seconds > 0) {
            zeroSeenAt = 0;
            setStatus(`正在按网站计时阅读……\n剩余时间：${reading.seconds}s`);
            await sleep(1000);
            continue;
          }

          if (reading.seconds === 0 && reading.complete && visible(reading.complete)) {
            zeroSeenAt = 0;
            await finishCurrentCourse(reading.complete, state);
            await sleep(800);
            continue;
          }

          if (!zeroSeenAt) zeroSeenAt = Date.now();
          setStatus("剩余时间已到 0s，正在等待“阅读完成”按钮可用……");
          if (Date.now() - zeroSeenAt > 30000) {
            throw new Error("已到 0s，但“阅读完成”按钮在 30 秒内仍不可用");
          }
          await sleep(500);
          continue;
        }

        zeroSeenAt = 0;
        if (state.phase === "opening" && Date.now() - state.phaseStartedAt < 30000) {
          setStatus("课程正在打开，等待计时页面……");
          await sleep(500);
          continue;
        }
        if (state.phase === "opening") {
          throw new Error("打开课程后没有识别到剩余时间，已安全停止");
        }

        if (state.phase === "closing" && Date.now() - state.phaseStartedAt < 5000) {
          setStatus("已完成本门课程，正在返回课程列表……");
          await sleep(500);
          continue;
        }

        state.phase = "list";
        if (await openNextCourse(state)) {
          emptySeenAt = 0;
          await sleep(800);
          continue;
        }

        if (!emptySeenAt) emptySeenAt = Date.now();
        if (Date.now() - emptySeenAt < 5000) {
          setStatus("正在刷新课程完成状态并查找下一门……");
          await sleep(500);
          continue;
        }

        const hasPendingText = /未完成|未学习|未阅读|待学习|学习中/.test(
          readableText(document.body)
        );
        if (allCoursesLookComplete() || (!hasPendingText && state.visited.length > 0)) {
          const count = state.visited.length;
          await clearCourseRun();
          setStatus(`课程阅读已全部完成。\n本次自动进入 ${count} 门课程。`, "done");
          return;
        }
        throw new Error("没有识别到下一门未完成课程，请保持课程列表展开后重试");
      }
    } catch (error) {
      await clearCourseRun();
      setStatus(`课程自动阅读已停止：${error.message}`, "error");
      console.error("Fudan SafeTest courses:", error);
    }
  }

  async function loadQuestionBank() {
    const response = await fetch(chrome.runtime.getURL("asset/questions.json"));
    if (!response.ok) throw new Error(`题库读取失败：HTTP ${response.status}`);
    const questions = await response.json();
    const usable = questions.filter(
      (question) =>
        question.stem &&
        Array.isArray(question.answers) &&
        question.answers.length &&
        Array.isArray(question.correct_answers) &&
        question.correct_answers.length
    );
    if (!usable.length) throw new Error("题库为空或格式不正确");
    return usable;
  }

  function levenshtein(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= right.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[right.length];
  }

  function bestQuestion(stem, questions) {
    const normalizedStem = normalize(stem);
    let best = null;
    for (const question of questions) {
      const candidate = normalize(question.stem);
      const similarity =
        candidate === normalizedStem
          ? 1
          : 1 - levenshtein(normalizedStem, candidate) / Math.max(1, normalizedStem.length, candidate.length);
      if (!best || similarity > best.similarity) best = { question, similarity };
      if (similarity === 1) break;
    }
    return best;
  }

  function questionArea() {
    return document.querySelector(".exams");
  }

  function questionStem(area) {
    const stem = area?.querySelector("p")?.innerText?.trim();
    if (!stem) throw new Error("没有识别到题干");
    return stem;
  }

  function optionText(element) {
    return element.innerText
      .trim()
      .replace(/^[A-Za-zＡ-Ｚａ-ｚ][.．、:：)）]\s*/, "")
      .trim();
  }

  async function answerCurrentQuestion(questions) {
    const area = await waitFor(questionArea, 15000);
    const stem = questionStem(area);
    const match = bestQuestion(stem, questions);
    if (!match || match.similarity < 0.75) {
      throw new Error(`题目匹配度过低：${stem}`);
    }

    const correct = new Set(match.question.correct_answers.map(normalize));
    let selected = 0;
    for (const option of area.querySelectorAll('[id="radiolist"]')) {
      if (!correct.has(normalize(optionText(option)))) continue;
      const control = Array.from(option.querySelectorAll("div")).find(visible) || option;
      control.click();
      selected += 1;
      await sleep(80);
    }
    if (selected !== correct.size) {
      throw new Error(`答案选项不完整：${selected}/${correct.size}，题目：${stem}`);
    }
    return { area, stem, selected, similarity: match.similarity };
  }

  async function enterExamIfNeeded() {
    if (questionArea()) return;

    const online = await waitFor(
      () => findControl(["在线考试"], [".fl", "button", "a"]),
      300000,
      500
    );
    online.click();

    try {
      const confirm = await waitFor(() => findControl(["确认"], ["button"]), 5000);
      confirm.click();
    } catch (_) {
      // Some accounts do not show this confirmation step.
    }

    const roomButton = await waitFor(() => {
      for (const card of document.querySelectorAll(".fl")) {
        if (card.innerText.includes("实验室安全在线校级卷")) {
          return card.querySelector("#intoExamRoom");
        }
      }
      return null;
    });
    roomButton.click();

    const start = await waitFor(() => document.getElementById("examOnlineStrat"));
    start.click();
    await waitFor(questionArea);
  }

  async function waitForQuestionChange(area, stem) {
    return waitFor(() => {
      const current = questionArea();
      if (!current) return "finished";
      if (!area.isConnected || current !== area || questionStem(current) !== stem) return current;
      return null;
    }, 15000);
  }

  async function answerAll(questions) {
    let processed = 0;
    let selected = 0;

    while (processed < MAX_QUESTIONS) {
      const result = await answerCurrentQuestion(questions);
      processed += 1;
      selected += result.selected;
      setStatus(
        `正在自动答题：${processed} 题\n匹配度：${Math.round(result.similarity * 100)}%\n${result.stem.slice(0, 45)}`
      );

      const next = findControl(["下一题"], ["button", "a"]);
      if (!next) break;
      sessionStorage.setItem(AUTO_RUN_KEY, "1");
      next.click();
      const state = await waitForQuestionChange(result.area, result.stem);
      if (state === "finished") break;
    }

    if (processed === MAX_QUESTIONS) throw new Error("题目超过 200 道，已安全停止");
    return { processed, selected };
  }

  async function clearAutoRun() {
    sessionStorage.removeItem(AUTO_RUN_KEY);
    await chrome.storage.local.remove(AUTO_RUN_KEY);
  }

  async function runExam() {
    if (examRunning) return;
    examRunning = true;
    try {
      setStatus("正在读取题库并等待考试页面……");
      const questions = await loadQuestionBank();
      await enterExamIfNeeded();
      const result = await answerAll(questions);
      await clearAutoRun();
      setStatus(
        `答题完成：${result.processed} 题，选择 ${result.selected} 个答案。\n不会自动提交，请核对后手动提交。`,
        "done"
      );
    } catch (error) {
      await clearAutoRun();
      setStatus(`自动答题已停止：${error.message}`, "error");
      console.error("Fudan SafeTest:", error);
    } finally {
      examRunning = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FUDAN_SAFE_TEST_START") {
      runExam();
      sendResponse({ started: true });
      return false;
    }
    if (message?.type === "FUDAN_SAFE_COURSE_START") {
      runCourses();
      sendResponse({ started: true });
      return false;
    }
    if (message?.type === "FUDAN_SAFE_COURSE_STOP") {
      clearCourseRun();
      setStatus("课程自动阅读已停止。", "done");
      sendResponse({ stopped: true });
      return false;
    }
    return false;
  });

  Promise.all([
    chrome.storage.local.get(AUTO_RUN_KEY),
    chrome.storage.local.get(COURSE_RUN_KEY),
    Promise.resolve(sessionStorage.getItem(AUTO_RUN_KEY)),
    Promise.resolve(sessionStorage.getItem(COURSE_SESSION_KEY)),
  ]).then(([stored, courseStored, local, courseLocal]) => {
    const startedAt = stored[AUTO_RUN_KEY];
    const recentlyRequested =
      typeof startedAt === "number" && Date.now() - startedAt < 10 * 60 * 1000;
    if (recentlyRequested || local === "1") runExam();

    const courseState = courseStored[COURSE_RUN_KEY];
    const courseRecentlyRequested =
      courseState &&
      typeof courseState.startedAt === "number" &&
      Date.now() - courseState.startedAt < COURSE_RUN_MAX_AGE;
    if (courseRecentlyRequested || courseLocal === "1") runCourses();
  });
})();

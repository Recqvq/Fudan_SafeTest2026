(() => {
  if (globalThis.__fudanSafeTestLoaded) return;
  globalThis.__fudanSafeTestLoaded = true;

  const AUTO_RUN_KEY = "fudanSafeTestAutoRun";
  const MAX_QUESTIONS = 200;
  let running = false;

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  function normalize(text) {
    return String(text || "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, "")
      .trim();
  }

  function visible(element) {
    return Boolean(
      element &&
        !element.disabled &&
        element.getClientRects().length &&
        getComputedStyle(element).visibility !== "hidden"
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

  async function run() {
    if (running) return;
    running = true;
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
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FUDAN_SAFE_TEST_START") return false;
    run();
    sendResponse({ started: true });
    return false;
  });

  Promise.all([
    chrome.storage.local.get(AUTO_RUN_KEY),
    Promise.resolve(sessionStorage.getItem(AUTO_RUN_KEY)),
  ]).then(([stored, local]) => {
    const startedAt = stored[AUTO_RUN_KEY];
    const recentlyRequested =
      typeof startedAt === "number" && Date.now() - startedAt < 10 * 60 * 1000;
    if (recentlyRequested || local === "1") run();
  });
})();

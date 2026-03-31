let currentExam = null;
let currentExamFileName = null;
let userAnswers = [];
let flaggedQuestions = [];
let orderingTouched = [];
let currentQuestionIndex = 0;
let questionOrder = [];
let navFilter = 'all';
let timerInterval = null;
let timeRemaining = 5400;
let examStarted = false;
let reviewMode = false;
let reviewIndices = [];
let isModalOpen = false;

const fileSelector = document.getElementById('fileSelector');
const examScreen = document.getElementById('examScreen');
const resultsScreen = document.getElementById('resultsScreen');
const headerStats = document.getElementById('headerStats');
const modePill = document.getElementById('modePill');
const fileList = document.getElementById('fileList');
const timerElement = document.getElementById('timer');
const progressCounter = document.getElementById('progressCounter');
const navGrid = document.getElementById('navGrid');
const questionNumber = document.getElementById('questionNumber');
const questionType = document.getElementById('questionType');
const questionText = document.getElementById('questionText');
const optionsArea = document.getElementById('optionsArea');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const submitExamBtn = document.getElementById('submitExamBtn');
const answeredCountEl = document.getElementById('answeredCount');
const flaggedCountEl = document.getElementById('flaggedCount');
const remainingCountEl = document.getElementById('remainingCount');
const nextUnansweredBtn = document.getElementById('nextUnansweredBtn');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const flagBtn = document.getElementById('flagBtn');
const clearAnswerBtn = document.getElementById('clearAnswerBtn');
const toggleExplanationBtn = document.getElementById('toggleExplanationBtn');
const explanationPanel = document.getElementById('explanationPanel');
const explanationBody = document.getElementById('explanationBody');
const explanationCorrect = document.getElementById('explanationCorrect');
const reviewBanner = document.getElementById('reviewBanner');
const reviewMeta = document.getElementById('reviewMeta');
const navActions = document.getElementById('navActions');

const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const toast = document.getElementById('toast');

async function loadExamFiles() {
    fileList.innerHTML = '<div class="loading">Loading exam files...</div>';

    try {
        let examFiles = [];
        try {
            const manifestResponse = await fetch('exams/manifest.json', { cache: 'no-store' });
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                if (Array.isArray(manifest?.files)) {
                    examFiles = manifest.files;
                }
            }
        } catch (e) {
            examFiles = [];
        }

        if (!examFiles.length) {
            examFiles = [
                'aif-c01-mock-exam-1.json',
                'aif-c01-mock-exam-2.json'
            ];
        }

        fileList.innerHTML = '';

        if (examFiles.length === 0) {
            fileList.innerHTML = '<div class="loading">No exam files found. Place JSON files in /exams/ folder and update exams/manifest.json.</div>';
            return;
        }

        examFiles.forEach(file => {
            const btn = document.createElement('button');
            btn.className = 'file-btn';
            btn.innerHTML = `
                <span class="file-icon">Q</span>
                <span>${file.replace('.json', '').replace(/-/g, ' ').toUpperCase()}</span>
            `;
            btn.onclick = () => loadExam(file);
            fileList.appendChild(btn);
        });
    } catch (error) {
        fileList.innerHTML = '<div class="loading">Error loading exam files. Please ensure JSON files are in /exams/ folder.</div>';
        console.error('Error loading exam files:', error);
    }
}

async function loadExam(fileName) {
    try {
        const response = await fetch(`exams/${fileName}`);
        currentExam = await response.json();
        currentExamFileName = fileName;
        maybeResumeExam();
    } catch (error) {
        showToast('Error loading exam file. Check the console for details.');
        console.error('Error loading exam:', error);
    }
}

function maybeResumeExam() {
    const saved = getSavedProgress();
    if (saved) {
        openModal({
            title: 'Resume previous session?',
            message: 'We found saved progress for this exam. Would you like to continue where you left off?',
            confirmText: 'Resume',
            cancelText: 'Start Over',
            onConfirm: () => initExam(saved),
            onCancel: () => {
                clearSavedProgress();
                initExam();
            }
        });
        return;
    }
    initExam();
}

function initExam(savedProgress = null) {
    userAnswers = new Array(currentExam.questions.length).fill(null);
    flaggedQuestions = new Array(currentExam.questions.length).fill(false);
    orderingTouched = new Array(currentExam.questions.length).fill(false);
    timeRemaining = (currentExam.timeLimitMinutes || 90) * 60;
    currentQuestionIndex = 0;
    navFilter = 'all';
    reviewMode = false;
    reviewIndices = [];

    if (savedProgress) {
        userAnswers = savedProgress.userAnswers || userAnswers;
        flaggedQuestions = savedProgress.flaggedQuestions || flaggedQuestions;
        orderingTouched = savedProgress.orderingTouched || orderingTouched;
        timeRemaining = savedProgress.timeRemaining || timeRemaining;
    }

    questionOrder = buildQuestionOrder();
    if (savedProgress && typeof savedProgress.currentQuestionActualIndex === 'number') {
        const idx = questionOrder.indexOf(savedProgress.currentQuestionActualIndex);
        currentQuestionIndex = idx >= 0 ? idx : 0;
    }

    examStarted = true;

    fileSelector.style.display = 'none';
    examScreen.style.display = 'block';
    resultsScreen.style.display = 'none';
    headerStats.style.display = 'flex';
    modePill.style.display = 'none';
    reviewBanner.style.display = 'none';
    toggleExplanationBtn.style.display = 'none';
    explanationPanel.style.display = 'none';
    document.body.classList.remove('review-mode');
    navActions.style.display = 'flex';

    startTimer();
    updateTimerDisplay();
    renderNavigationGrid();
    renderCurrentQuestion();
    updateProgress();
    updateStats();
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            submitExam();
        } else {
            timeRemaining--;
            updateTimerDisplay();
            saveProgress();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;
    timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateProgress() {
    const answered = countAnswered();
    progressCounter.textContent = `${answered}/${currentExam.questions.length}`;
    const percent = Math.round((answered / currentExam.questions.length) * 100);
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `${percent}% Complete`;
}

function updateStats() {
    const answered = countAnswered();
    const flagged = flaggedQuestions.filter(Boolean).length;
    const remaining = currentExam.questions.length - answered;
    answeredCountEl.textContent = answered;
    flaggedCountEl.textContent = flagged;
    remainingCountEl.textContent = remaining;
}

function countAnswered() {
    return currentExam.questions.reduce((count, q, idx) => {
        return count + (isAnswered(q, userAnswers[idx], idx) ? 1 : 0);
    }, 0);
}

function buildQuestionOrder() {
    if (reviewMode) {
        return reviewIndices.length ? reviewIndices : [];
    }
    const indices = currentExam.questions.map((_, idx) => idx);
    if (navFilter === 'unanswered') {
        return indices.filter(idx => !isAnswered(currentExam.questions[idx], userAnswers[idx], idx));
    }
    if (navFilter === 'flagged') {
        return indices.filter(idx => flaggedQuestions[idx]);
    }
    return indices;
}

function renderNavigationGrid() {
    navGrid.innerHTML = '';

    if (questionOrder.length === 0) {
        navGrid.innerHTML = '<div class="loading">No questions in this view.</div>';
        return;
    }

    questionOrder.forEach((actualIdx, viewIdx) => {
        const btn = document.createElement('button');
        btn.className = 'nav-tile';

        if (isAnswered(currentExam.questions[actualIdx], userAnswers[actualIdx], actualIdx)) {
            btn.classList.add('answered');
        }
        if (viewIdx === currentQuestionIndex) {
            btn.classList.add('current');
        }
        if (flaggedQuestions[actualIdx]) {
            btn.classList.add('flagged');
        }

        btn.textContent = actualIdx + 1;
        btn.onclick = () => goToQuestion(viewIdx);
        navGrid.appendChild(btn);
    });
}

function goToQuestion(viewIndex) {
    if (viewIndex < 0 || viewIndex >= questionOrder.length) return;
    currentQuestionIndex = viewIndex;
    renderCurrentQuestion();
    renderNavigationGrid();
    saveProgress();
}

function renderCurrentQuestion() {
    if (!questionOrder.length) return;
    const actualIdx = questionOrder[currentQuestionIndex];
    const q = currentExam.questions[actualIdx];

    questionNumber.textContent = `Question ${actualIdx + 1}`;
    questionType.textContent = getQuestionTypeLabel(q.type);
    questionText.textContent = q.text;

    const isFlagged = flaggedQuestions[actualIdx];
    flagBtn.classList.toggle('flagged', isFlagged);
    flagBtn.textContent = isFlagged ? 'Flagged' : 'Flag';

    renderOptions(q, actualIdx);
    renderExplanation(q, actualIdx);
}

function getQuestionTypeLabel(type) {
    const labels = {
        'multiple-choice': 'Multiple Choice',
        'multiple-response': 'Multiple Response',
        'matching': 'Matching',
        'ordering': 'Ordering'
    };
    return labels[type] || type;
}

function renderOptions(q, actualIdx) {
    optionsArea.innerHTML = '';
    optionsArea.classList.toggle('disabled', reviewMode);

    if (q.type === 'multiple-choice') {
        q.options.forEach((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            if (userAnswers[actualIdx] === idx) {
                optionDiv.classList.add('selected');
            }
            if (reviewMode) {
                if (q.correct[0] === idx) optionDiv.classList.add('correct');
                if (userAnswers[actualIdx] === idx && q.correct[0] !== idx) optionDiv.classList.add('incorrect');
            }
            optionDiv.onclick = () => selectMultipleChoice(actualIdx, idx);
            optionDiv.innerHTML = `
                <span class="option-prefix">${letter}.</span>
                <span class="option-text">${opt}</span>
            `;
            optionsArea.appendChild(optionDiv);
        });
    } else if (q.type === 'multiple-response') {
        const selected = userAnswers[actualIdx] || [];
        q.options.forEach((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            if (selected.includes(idx)) {
                optionDiv.classList.add('selected');
            }
            if (reviewMode) {
                if (q.correct.includes(idx)) optionDiv.classList.add('correct');
                if (selected.includes(idx) && !q.correct.includes(idx)) optionDiv.classList.add('incorrect');
            }
            optionDiv.onclick = () => toggleMultipleResponse(actualIdx, idx);
            optionDiv.innerHTML = `
                <span class="option-prefix">${letter}.</span>
                <span class="option-text">${opt}</span>
            `;
            optionsArea.appendChild(optionDiv);
        });
    } else if (q.type === 'matching') {
        const currentMatches = userAnswers[actualIdx] || new Array(q.leftItems.length).fill(-1);

        q.leftItems.forEach((left, idx) => {
            const row = document.createElement('div');
            row.className = 'matching-row';
            row.innerHTML = `
                <span class="matching-left">${left}</span>
                <span>?</span>
                <select class="matching-select" data-index="${idx}" ${reviewMode ? 'disabled' : ''}>
                    <option value="-1">-- Select --</option>
                    ${q.rightItems.map((right, rightIdx) => `
                        <option value="${rightIdx}" ${currentMatches[idx] === rightIdx ? 'selected' : ''}>${right}</option>
                    `).join('')}
                </select>
            `;
            optionsArea.appendChild(row);
        });

        document.querySelectorAll('.matching-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                const value = parseInt(e.target.value, 10);
                const current = userAnswers[actualIdx] || new Array(q.leftItems.length).fill(-1);
                current[idx] = value;
                userAnswers[actualIdx] = current;
                updateProgress();
                updateStats();
                renderNavigationGrid();
                saveProgress();
            });
        });
    } else if (q.type === 'ordering') {
        let currentOrder = userAnswers[actualIdx];
        if (!currentOrder) {
            currentOrder = [...Array(q.options.length).keys()];
            shuffleArray(currentOrder);
            userAnswers[actualIdx] = currentOrder;
        }

        currentOrder.forEach((itemIdx, position) => {
            const row = document.createElement('div');
            row.className = 'ordering-row';
            row.innerHTML = `
                <span class="ordering-item">${position + 1}.</span>
                <span class="option-text">${q.options[itemIdx]}</span>
                <div class="ordering-controls">
                    <button class="move-up" data-pos="${position}" ${reviewMode ? 'disabled' : ''}>Up</button>
                    <button class="move-down" data-pos="${position}" ${reviewMode ? 'disabled' : ''}>Down</button>
                </div>
            `;
            optionsArea.appendChild(row);
        });

        document.querySelectorAll('.move-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pos = parseInt(e.target.dataset.pos, 10);
                if (pos > 0) {
                    const order = [...userAnswers[actualIdx]];
                    [order[pos], order[pos - 1]] = [order[pos - 1], order[pos]];
                    userAnswers[actualIdx] = order;
                    orderingTouched[actualIdx] = true;
                    renderOptions(q, actualIdx);
                    updateProgress();
                    updateStats();
                    renderNavigationGrid();
                    saveProgress();
                }
            });
        });

        document.querySelectorAll('.move-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pos = parseInt(e.target.dataset.pos, 10);
                const order = [...userAnswers[actualIdx]];
                if (pos < order.length - 1) {
                    [order[pos], order[pos + 1]] = [order[pos + 1], order[pos]];
                    userAnswers[actualIdx] = order;
                    orderingTouched[actualIdx] = true;
                    renderOptions(q, actualIdx);
                    updateProgress();
                    updateStats();
                    renderNavigationGrid();
                    saveProgress();
                }
            });
        });
    }
}

function renderExplanation(q, actualIdx) {
    if (!reviewMode) {
        explanationPanel.style.display = 'none';
        return;
    }

    const showPanel = toggleExplanationBtn.dataset.open === 'true';
    if (!showPanel) {
        explanationPanel.style.display = 'none';
        return;
    }

    explanationPanel.style.display = 'block';
    explanationBody.textContent = q.explanation || 'No explanation provided.';
    explanationCorrect.textContent = `Correct answer: ${getCorrectAnswerText(q)}`;
}

function getCorrectAnswerText(question) {
    if (question.type === 'multiple-choice') {
        return question.correct.map(idx => `${String.fromCharCode(65 + idx)}. ${question.options[idx]}`).join(', ');
    }
    if (question.type === 'multiple-response') {
        return question.correct.map(idx => `${String.fromCharCode(65 + idx)}. ${question.options[idx]}`).join(', ');
    }
    if (question.type === 'matching') {
        return question.leftItems.map((left, idx) => `${left} ? ${question.rightItems[question.correct[idx]]}`).join(' | ');
    }
    if (question.type === 'ordering') {
        return question.correct.map(idx => question.options[idx]).join(' ? ');
    }
    return 'N/A';
}

function selectMultipleChoice(actualIdx, choiceIndex) {
    if (reviewMode) return;
    userAnswers[actualIdx] = choiceIndex;
    updateProgress();
    updateStats();
    renderNavigationGrid();
    renderCurrentQuestion();
    saveProgress();
}

function toggleMultipleResponse(actualIdx, choiceIndex) {
    if (reviewMode) return;
    let selected = userAnswers[actualIdx] || [];
    if (selected.includes(choiceIndex)) {
        selected = selected.filter(i => i !== choiceIndex);
    } else {
        selected.push(choiceIndex);
        selected.sort((a, b) => a - b);
    }
    userAnswers[actualIdx] = selected;
    updateProgress();
    updateStats();
    renderNavigationGrid();
    renderCurrentQuestion();
    saveProgress();
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function isAnswered(question, answer, idx) {
    if (answer === null || answer === undefined) return false;
    if (question.type === 'multiple-response') {
        return Array.isArray(answer) && answer.length > 0;
    }
    if (question.type === 'matching') {
        return Array.isArray(answer) && answer.every(val => val >= 0);
    }
    if (question.type === 'ordering') {
        return Array.isArray(answer) && answer.length === question.options.length && orderingTouched[idx] === true;
    }
    return true;
}

prevBtn.onclick = () => {
    if (currentQuestionIndex > 0) {
        goToQuestion(currentQuestionIndex - 1);
    }
};

nextBtn.onclick = () => {
    if (currentQuestionIndex < questionOrder.length - 1) {
        goToQuestion(currentQuestionIndex + 1);
    }
};

submitExamBtn.onclick = () => {
    openModal({
        title: 'Submit exam now?',
        message: 'You will not be able to change answers after submission.',
        confirmText: 'Submit',
        cancelText: 'Continue Exam',
        onConfirm: () => submitExam()
    });
};

flagBtn.onclick = () => {
    const actualIdx = questionOrder[currentQuestionIndex];
    flaggedQuestions[actualIdx] = !flaggedQuestions[actualIdx];
    renderCurrentQuestion();
    renderNavigationGrid();
    updateStats();
    saveProgress();
};

clearAnswerBtn.onclick = () => {
    if (reviewMode) return;
    const actualIdx = questionOrder[currentQuestionIndex];
    userAnswers[actualIdx] = null;
    orderingTouched[actualIdx] = false;
    renderCurrentQuestion();
    renderNavigationGrid();
    updateProgress();
    updateStats();
    saveProgress();
};

toggleExplanationBtn.onclick = () => {
    const isOpen = toggleExplanationBtn.dataset.open === 'true';
    toggleExplanationBtn.dataset.open = (!isOpen).toString();
    toggleExplanationBtn.textContent = isOpen ? 'Explanation' : 'Hide Explanation';
    renderCurrentQuestion();
};

nextUnansweredBtn.onclick = () => {
    if (reviewMode) return;
    const total = currentExam.questions.length;
    const currentActual = questionOrder[currentQuestionIndex] ?? 0;
    let target = null;

    for (let step = 1; step <= total; step++) {
        const idx = (currentActual + step) % total;
        if (!isAnswered(currentExam.questions[idx], userAnswers[idx], idx)) {
            target = idx;
            break;
        }
    }

    if (target === null) {
        showToast('All questions are answered.');
        return;
    }

    if (navFilter !== 'all') {
        setNavFilter('all');
    }

    const viewIndex = questionOrder.indexOf(target);
    if (viewIndex >= 0) {
        goToQuestion(viewIndex);
    }
};

navActions.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn || reviewMode) return;
    setNavFilter(btn.dataset.filter);
});

function setNavFilter(filter) {
    navFilter = filter;
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    questionOrder = buildQuestionOrder();
    currentQuestionIndex = 0;
    renderNavigationGrid();
    renderCurrentQuestion();
}

function submitExam() {
    clearInterval(timerInterval);

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    currentExam.questions.forEach((q, idx) => {
        const userAnswer = userAnswers[idx];
        const isCorrect = checkAnswer(q, userAnswer, idx);

        if (isCorrect) {
            correctCount++;
        } else if (!isAnswered(q, userAnswer, idx)) {
            unansweredCount++;
        } else {
            incorrectCount++;
        }
    });

    const rawScore = (correctCount / currentExam.questions.length) * 1000;
    const scaledScore = Math.round(rawScore);
    const passed = scaledScore >= (currentExam.passingScore || 700);

    const timeTakenSeconds = (currentExam.timeLimitMinutes || 90) * 60 - timeRemaining;
    const timeHours = Math.floor(timeTakenSeconds / 3600);
    const timeMinutes = Math.floor((timeTakenSeconds % 3600) / 60);
    const timeSeconds = timeTakenSeconds % 60;

    examScreen.style.display = 'none';
    resultsScreen.style.display = 'flex';
    headerStats.style.display = 'none';
    modePill.style.display = 'none';

    document.getElementById('scoreNumber').textContent = scaledScore;
    document.getElementById('correctCount').textContent = correctCount;
    document.getElementById('incorrectCount').textContent = incorrectCount;
    document.getElementById('unansweredCount').textContent = unansweredCount;
    document.getElementById('timeTaken').textContent = `${timeHours.toString().padStart(2, '0')}:${timeMinutes.toString().padStart(2, '0')}:${timeSeconds.toString().padStart(2, '0')}`;

    const passStatus = document.getElementById('passStatus');
    passStatus.textContent = passed ? 'PASSED' : 'FAILED';
    passStatus.className = `pass-status ${passed ? 'passed' : 'failed'}`;

    const scoreCircle = document.getElementById('scoreCircle');
    scoreCircle.style.border = `3px solid ${passed ? '#22c55e' : '#f97316'}`;
    document.getElementById('scoreNumber').style.color = passed ? '#22c55e' : '#f97316';

    clearSavedProgress();
}

function checkAnswer(question, userAnswer, idx) {
    if (!isAnswered(question, userAnswer, idx)) return false;

    if (question.type === 'multiple-choice') {
        return userAnswer === question.correct[0];
    }
    if (question.type === 'multiple-response') {
        if (!Array.isArray(userAnswer)) return false;
        if (userAnswer.length !== question.correct.length) return false;
        return userAnswer.every((val, idx) => val === question.correct[idx]);
    }
    if (question.type === 'matching') {
        if (!Array.isArray(userAnswer)) return false;
        return userAnswer.every((val, idx) => val === question.correct[idx]);
    }
    if (question.type === 'ordering') {
        if (!Array.isArray(userAnswer)) return false;
        return userAnswer.every((val, idx) => val === question.correct[idx]);
    }

    return false;
}

document.getElementById('newExamBtn').onclick = () => {
    window.location.reload();
};

document.getElementById('reviewBtn').onclick = () => {
    const incorrect = currentExam.questions
        .map((q, idx) => ({ idx, correct: checkAnswer(q, userAnswers[idx], idx) }))
        .filter(item => !item.correct)
        .map(item => item.idx);

    if (!incorrect.length) {
        showToast('Perfect score. Nothing to review.');
        return;
    }

    enterReviewMode(incorrect);
};

function enterReviewMode(indices) {
    reviewMode = true;
    reviewIndices = indices;
    navFilter = 'all';
    questionOrder = buildQuestionOrder();
    currentQuestionIndex = 0;

    examScreen.style.display = 'block';
    resultsScreen.style.display = 'none';
    fileSelector.style.display = 'none';
    headerStats.style.display = 'none';
    modePill.style.display = 'inline-flex';
    reviewBanner.style.display = 'flex';
    reviewMeta.textContent = `${indices.length} questions to review`;
    toggleExplanationBtn.style.display = 'inline-flex';
    toggleExplanationBtn.dataset.open = 'true';
    toggleExplanationBtn.textContent = 'Hide Explanation';
    navActions.style.display = 'none';

    clearInterval(timerInterval);

    renderNavigationGrid();
    renderCurrentQuestion();
    updateProgress();
    updateStats();
}

function saveProgress() {
    if (!examStarted || reviewMode) return;
    const key = getStorageKey();
    const currentActualIndex = questionOrder[currentQuestionIndex] ?? 0;
    const data = {
        userAnswers,
        flaggedQuestions,
        orderingTouched,
        timeRemaining,
        currentQuestionActualIndex
    };
    localStorage.setItem(key, JSON.stringify(data));
}

function getSavedProgress() {
    const key = getStorageKey();
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

function clearSavedProgress() {
    const key = getStorageKey();
    localStorage.removeItem(key);
}

function getStorageKey() {
    const name = currentExam?.examName || currentExamFileName || 'exam';
    return `examProgress_${name.replace(/\s+/g, '_')}`;
}

function openModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirmBtn.textContent = confirmText;
    modalCancelBtn.textContent = cancelText;

    modalBackdrop.style.display = 'flex';
    isModalOpen = true;

    const cleanup = () => {
        modalBackdrop.style.display = 'none';
        isModalOpen = false;
        modalConfirmBtn.onclick = null;
        modalCancelBtn.onclick = null;
    };

    modalConfirmBtn.onclick = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };

    modalCancelBtn.onclick = () => {
        cleanup();
        if (onCancel) onCancel();
    };
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
}

window.addEventListener('keydown', (e) => {
    if (!examStarted || reviewMode) return;
    if (isModalOpen) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === 'ArrowLeft') {
        prevBtn.click();
    }
    if (e.key === 'ArrowRight') {
        nextBtn.click();
    }
    if (e.key.toLowerCase() === 'f') {
        flagBtn.click();
    }
});

loadExamFiles();

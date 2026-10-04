/* Interactive exercises; all case content is bundled with the website. */
(() => {
    'use strict';

    const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));

    const sourceNumber = number => Number.isInteger(number) && number > 0
        ? `<span class="case-source-number" data-source-number="${number}">${number}. </span>` : '';

    function shuffledChoices(question) {
        const choices = question.options.map((text, index) => ({ text, correct: index === question.answer }));
        for (let index = choices.length - 1; index > 0; index--) {
            const other = Math.floor(Math.random() * (index + 1));
            [choices[index], choices[other]] = [choices[other], choices[index]];
        }
        return choices;
    }

    function create(lessonId) {
        const key = String(lessonId);
        if (!/^(?:[1-9]|1[0-5])$/.test(key)) return null;
        const source = window.caseExercises?.[key];
        if (!Array.isArray(source) || !source.length) return null;
        const cases = source.map(item => ({
            ...item,
            questions: item.questions.map(question => ({ ...question, choices: shuffledChoices(question) }))
        }));
        const nameFor = (caseIndex, questionIndex) => `case-${key}-${caseIndex}-${questionIndex}`;
        const html = `<div class="case-work" data-case-lesson="${key}">
            <p class="case-work-intro">Әр сұраққа бір жауап таңдаңыз. Тексергеннен кейін файлдағы жауаптар көрсетіледі.</p>
            ${cases.map((item, caseIndex) => `<article class="case-exercise">
                <h3>${escapeHtml(item.title)}</h3>
                ${item.scenario.length ? `<div class="case-scenario">${item.scenario.map(text => `<p>${escapeHtml(text)}</p>`).join('')}</div>` : ''}
                <form class="case-form" data-case-index="${caseIndex}" novalidate>
                    ${item.questionHeading ? `<h4 class="case-question-heading">${escapeHtml(item.questionHeading)}</h4>` : ''}
                    ${item.questions.map((question, questionIndex) => `<fieldset class="case-question" data-case-question="${questionIndex}">
                        <legend>${sourceNumber(question.promptNumber)}<span class="case-prompt-text">${escapeHtml(question.prompt)}</span></legend>
                        <div class="case-options">${question.choices.map((choice, choiceIndex) => `<label class="case-option">
                            <input type="radio" name="${nameFor(caseIndex, questionIndex)}" value="${choiceIndex}" aria-describedby="${nameFor(caseIndex, questionIndex)}-feedback">
                            <span class="case-option-letter" aria-hidden="true">${'ABCD'[choiceIndex]}</span>
                            <span class="case-option-text">${escapeHtml(choice.text)}</span>
                        </label>`).join('')}</div>
                        <div id="${nameFor(caseIndex, questionIndex)}-feedback" class="case-feedback" hidden></div>
                    </fieldset>`).join('')}
                    <div class="case-source-answer" hidden>${item.sourceAnswers.map((text, index) => `<p>${sourceNumber(item.sourceAnswerNumbers?.[index])}<span class="case-source-answer-text">${escapeHtml(text)}</span></p>`).join('')}</div>
                    <p class="case-result" role="status" tabindex="-1"></p>
                    <div class="case-form-actions">
                        <button class="nav-btn primary-btn" type="submit">Жауаптарды тексеру</button>
                        <button class="nav-btn secondary-btn case-retry" type="button" hidden>Қайта орындау</button>
                    </div>
                </form>
            </article>`).join('')}
        </div>`;

        function mount(container) {
            for (const form of container.querySelectorAll('.case-form')) {
                const caseIndex = Number(form.dataset.caseIndex);
                const item = cases[caseIndex];
                const result = form.querySelector('.case-result');
                const checkButton = form.querySelector('[type="submit"]');
                const retryButton = form.querySelector('.case-retry');
                const sourceAnswer = form.querySelector('.case-source-answer');
                let submitted = false;

                form.addEventListener('submit', event => {
                    event.preventDefault();
                    if (submitted) return;
                    const selected = item.questions.map((_, index) => form.querySelector(`input[name="${nameFor(caseIndex, index)}"]:checked`));
                    const missingIndex = selected.findIndex(answer => !answer);
                    if (missingIndex !== -1) {
                        result.textContent = 'Барлық сұраққа жауап таңдаңыз.';
                        form.querySelector(`[data-case-question="${missingIndex}"] input`).focus();
                        return;
                    }

                    submitted = true;
                    let score = 0;
                    item.questions.forEach((question, index) => {
                        const field = form.querySelector(`[data-case-question="${index}"]`);
                        const choiceIndex = Number(selected[index].value);
                        const correctIndex = question.choices.findIndex(choice => choice.correct);
                        const correct = choiceIndex === correctIndex;
                        if (correct) score++;
                        field.classList.add(correct ? 'case-is-correct' : 'case-is-incorrect');
                        for (const input of field.querySelectorAll('input')) {
                            const option = input.closest('.case-option');
                            option.classList.toggle('case-option-correct', Number(input.value) === correctIndex);
                            option.classList.toggle('case-option-wrong', input === selected[index] && !correct);
                            input.disabled = true;
                        }
                        const feedback = field.querySelector('.case-feedback');
                        feedback.innerHTML = `<p class="case-answer-status">${correct ? 'Дұрыс жауап.' : 'Жауап қате.'}</p>
                            ${correct ? '' : `<p class="case-original-answer"><strong>Файлдағы жауап:</strong> ${escapeHtml(question.choices[correctIndex].text)}</p>`}`;
                        feedback.hidden = false;
                    });
                    sourceAnswer.hidden = false;
                    result.textContent = `Нәтиже: ${score} / ${item.questions.length} дұрыс жауап.`;
                    checkButton.hidden = true;
                    retryButton.hidden = false;
                    result.focus({ preventScroll: true });
                });

                retryButton.addEventListener('click', () => {
                    submitted = false;
                    for (const input of form.querySelectorAll('input')) {
                        input.checked = false;
                        input.disabled = false;
                    }
                    for (const field of form.querySelectorAll('.case-question')) field.classList.remove('case-is-correct', 'case-is-incorrect');
                    for (const option of form.querySelectorAll('.case-option')) option.classList.remove('case-option-correct', 'case-option-wrong');
                    for (const feedback of form.querySelectorAll('.case-feedback')) {
                        feedback.hidden = true;
                        feedback.innerHTML = '';
                    }
                    result.textContent = '';
                    sourceAnswer.hidden = true;
                    checkButton.hidden = false;
                    retryButton.hidden = true;
                    form.querySelector('input').focus();
                });
            }
        }

        return { html, mount };
    }

    window.CaseWork = Object.freeze({ create });
})();

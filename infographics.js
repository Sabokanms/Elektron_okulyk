/* Supplied infographic images, numbered to match the 15 lectures. */
(function () {
    'use strict';

    const sizes = [
        [885, 1252], [408, 607], [935, 1374], [408, 596], [408, 571],
        [408, 588], [408, 603], [408, 600], [408, 595], [935, 1376],
        [935, 1326], [403, 593], [408, 581], [408, 598], [408, 591]
    ];

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function render(lessonId) {
        const key = String(lessonId);
        if (!/^(?:[1-9]|1[0-5])$/.test(key)) return null;
        const [width, height] = sizes[Number(key) - 1];
        const title = window.lectureTexts?.[key]?.title || `${key}-дәріс`;
        // Resolve beside this page, including when the site is hosted in a subfolder.
        const source = `assets/infographics/${key}.jpg`;
        return `<figure class="lecture-infographic infographic-photo">
            <img class="infographic-image" src="${source}" width="${width}" height="${height}"
                alt="${escapeHtml(title)} — инфографика" decoding="async">
        </figure>`;
    }

    window.LectureInfographics = Object.freeze({ render });
}());

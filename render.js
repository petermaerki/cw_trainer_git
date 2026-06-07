function renderActualFromTaggedString(tagged, outputEl) {
    const markers = new Set(['✓', '⊕', '✗', '○', '…']);
    outputEl.replaceChildren();
    const frag = document.createDocumentFragment();
    let i = 0;

    while (i < tagged.length) {
        const marker = tagged[i];
        if (!markers.has(marker)) {
            i++;
            continue;
        }
        i++;
        const start = i;
        while (i < tagged.length && !markers.has(tagged[i])) i++;
        const text = tagged.slice(start, i);

        const span = document.createElement('span');
        span.className = marker;
        span.textContent = text;
        frag.appendChild(span);
    }
    outputEl.appendChild(frag);
}

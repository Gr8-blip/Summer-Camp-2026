def _norm(x):
    """Trim whitespace and lowercase for tolerant comparisons — protects
    against admin data-entry typos (stray spaces, inconsistent casing)
    silently zeroing out an otherwise-correct answer."""
    return str(x).strip().lower()


def score_fraction(question, response):
    content = question.content
    qtype = question.question_type
    expected = content.get('answer', content.get('answers'))
 
    if qtype == 'prompt_build':
        return 1.0 if str(response or '').strip() else 0.0
 
    if qtype == 'drag_order':
        items = content.get('items', [])
        if not items or not isinstance(response, list) or len(response) != len(items):
            return 0.0
        matches = sum(1 for a, b in zip(response, items) if _norm(a) == _norm(b))
        return matches / len(items)
 
    if qtype == 'match_pairs':
        pairs = content.get('pairs', content.get('answer', {}))
        if not pairs or not isinstance(response, dict):
            return 0.0
        norm_pairs = {_norm(k): _norm(v) for k, v in pairs.items()}
        norm_response = {_norm(k): _norm(v) for k, v in response.items()}
        matched = sum(1 for k, v in norm_pairs.items() if norm_response.get(k) == v)
        return matched / len(norm_pairs)
 
    if qtype == 'memory_tiles':
        return 1.0 if isinstance(response, dict) and response.get('completed') else 0.0
 
    if qtype == 'word_search':
        words = {w.strip().upper() for w in content.get('words', [])}
        found = {str(w).strip().upper() for w in response} if isinstance(response, list) else set()
        if not words:
            return 0.0
        return len(words & found) / len(words)
 
    if qtype == 'interactive_coding':
        # Same trust model as memory_tiles above: the sandboxed iframe is
        # the only thing with access to the rendered DOM/CSS, so it runs the
        # checks itself and reports back which ones passed. We just verify
        # shape and award fractional credit — never re-run untrusted
        # student JS server-side.
        checks = content.get('checks', [])
        if not checks or not isinstance(response, dict):
            return 0.0
        results = response.get('results')
        if not isinstance(results, list) or len(results) != len(checks):
            # Malformed or stale payload — never award for it.
            return 0.0
        passed = sum(1 for r in results if r is True)
        return passed / len(checks)

    if qtype == 'image_reveal':
        got = str(response or '').strip().lower()
        want = str(expected or '').strip().lower()
        return 1.0 if got == want else 0.0
 
    if qtype == 'fill_blank':
        got = str(response or '').strip().lower()
        if isinstance(expected, (list, tuple, set)):
            accepted = {str(w).strip().lower() for w in expected}
            return 1.0 if got in accepted else 0.0
        want = str(expected or '').strip().lower()
        return 1.0 if got == want else 0.0
 
    if isinstance(expected, bool):
        return 1.0 if (response is expected or _norm(response) == _norm(expected)) else 0.0
 
    # multiple_choice, true_false stored as a string instead of a real bool,
    # and any other exact-match type: normalize both sides so a stray space
    # or case difference (e.g. "B" vs "b", "1" vs " 1") doesn't zero out an
    # otherwise-correct answer.
    return 1.0 if _norm(response) == _norm(expected) else 0.0
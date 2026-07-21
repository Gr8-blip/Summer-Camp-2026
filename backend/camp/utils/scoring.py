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
        matches = sum(1 for a, b in zip(response, items) if a == b)
        return matches / len(items)
 
    if qtype == 'match_pairs':
        pairs = content.get('pairs', content.get('answer', {}))
        if not pairs or not isinstance(response, dict):
            return 0.0
        matched = sum(1 for k, v in pairs.items() if response.get(k) == v)
        return matched / len(pairs)
 
    if qtype == 'memory_tiles':
        return 1.0 if isinstance(response, dict) and response.get('completed') else 0.0
 
    if qtype == 'word_search':
        words = {w.strip().upper() for w in content.get('words', [])}
        found = {str(w).strip().upper() for w in response} if isinstance(response, list) else set()
        if not words:
            return 0.0
        return len(words & found) / len(words)
 
    if qtype == 'image_reveal':
        got = str(response or '').strip().lower()
        want = str(expected or '').strip().lower()
        return 1.0 if got == want else 0.0
 
    if isinstance(expected, bool):
        return 1.0 if (response is expected or str(response).lower() == str(expected).lower()) else 0.0
 
    return 1.0 if response == expected else 0.0
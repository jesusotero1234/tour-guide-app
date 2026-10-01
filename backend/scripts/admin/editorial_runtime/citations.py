"""Conservative inline-link parser with source offsets; never paraphrase citations."""
import hashlib
import re

POLICY = 'visible-inline-links-literal-v1'
QUOTES = str.maketrans({'«':'"','»':'"','“':'"','”':'"','‘':"'",'’':"'"})


def visible_source(source):
    # Only parse balanced inline links. Unsupported Markdown remains literal.
    chars, offsets, links = [], [], []
    i = 0
    def balanced(start, opening, closing):
        depth, j = 1, start + 1
        while j < len(source):
            if source[j] == '\\':
                j += 2
                continue
            if source[j] == opening: depth += 1
            if source[j] == closing:
                depth -= 1
                if not depth: return j
            j += 1
        return None
    while i < len(source):
        if source[i] == '[' and (i == 0 or source[i-1] not in '!\\'):
            end = balanced(i, '[', ']')
            dest = balanced(end+1, '(', ')') if end is not None and source[end+1:end+2] == '(' else None
            if dest is not None and '\n' not in source[end+2:dest]:
                label = source[i+1:end]
                # Nested syntax requires a richer parser; keep it literal rather than guess.
                if label and not any(c in label for c in '[]\\'):
                    links.append(dict(start=i,end=dest+1,labelStart=i+1,labelEnd=end,url=source[end+2:dest]))
                    for pos in range(i+1,end): chars.append(source[pos]); offsets.append((pos,pos+1))
                    i = dest+1
                    continue
        chars.append(source[i]); offsets.append((i,i+1)); i += 1
    return ''.join(chars), offsets, links


def normalized(text, mapping=None):
    mapping = mapping or [(i,i+1) for i in range(len(text))]
    chars, offsets = [], []
    for match in re.finditer(r'\s+|[^\s]', text):
        token = match[0]
        if token.isspace():
            if not chars or match.end() == len(text) or text[match.end()] in '.,;:!?': continue
            token = ' '
        chars.append(token.translate(QUOTES)); offsets.append((mapping[match.start()][0],mapping[match.end()-1][1]))
    return ''.join(chars), offsets


def resolve(quote, source):
    if not isinstance(quote,str) or not isinstance(source,str): raise ValueError('quote/source must be strings')
    if len(quote.strip()) >= 4 and source.count(quote) == 1:
        start=source.index(quote)
        return dict(before=quote,after=quote,sourceStart=start,sourceEnd=start+len(quote),
                    sourceSha256=hashlib.sha256(source.encode()).hexdigest(),policy=POLICY,links=[])
    visible, mapping, links = visible_source(source)
    haystack, offsets = normalized(visible,mapping)
    needle,_ = normalized(quote)
    if len(needle) < 4: raise ValueError('empty/short quote')
    fragments = re.split(r'\.\.\.|…',needle)
    spans = []
    for fragment in fragments:
        fragment = fragment.strip()
        if len(fragment) < 4: raise ValueError('empty/short omission fragment')
        hits = list(re.finditer('(?=('+re.escape(fragment)+'))',haystack,re.IGNORECASE))
        if len(hits) != 1: raise ValueError('quote has no unique literal source match')
        span = hits[0].span(1)
        if spans and span[0] < spans[-1][1]: raise ValueError('omission fragments overlap or change source order')
        spans.append(span)
    start,end = offsets[spans[0][0]][0],offsets[spans[-1][1]-1][1]
    return dict(before=quote,after=source[start:end],sourceStart=start,sourceEnd=end,
        sourceSha256=hashlib.sha256(source.encode()).hexdigest(),policy=POLICY,
        links=[link for link in links if link['start'] < end and link['end'] > start])


def disambiguate_repeated_literal(quote, source):
    """Extend an exact repeated quote with nearby source words until it is unique."""
    if not isinstance(quote, str) or not isinstance(source, str) or len(quote.strip()) < 4:
        return None
    starts = [match.start() for match in re.finditer(re.escape(quote), source)]
    if len(starts) < 2:
        return None
    candidates = []
    for start in starts:
        end = start + len(quote)
        left, right = start, end
        for _ in range(8):
            left_match = re.search(r'\S+\s*$', source[:left])
            right_match = re.match(r'\s*\S+', source[right:])
            expanded = []
            if left_match:
                left = left_match.start()
                expanded.append((left, end))
            if right_match:
                right += right_match.end()
                expanded.append((start, right))
            if left_match and right_match:
                expanded.append((left, right))
            for candidate_start, candidate_end in expanded:
                candidate = source[candidate_start:candidate_end].strip()
                if source.count(candidate) == 1:
                    candidates.append((len(candidate), candidate_start, candidate))
            if candidates:
                break
    return min(candidates)[2] if candidates else None


def normalize_response(obj, case, texts=None):
    """Normalize only citation fields; retain decisions, issues, severity and all IDs."""
    adjustments=[]
    pieces={p['pieceId']:p for p in case['pieces']}
    for row_index,row in enumerate(obj.get('pieces',[])):
        piece=pieces.get(row.get('pieceId'))
        if not piece: continue
        original={p['paragraphId']:p['text'] for p in piece.get('paragraphs',[])}
        current={f'p{i:02d}':p for i,p in enumerate(texts[piece['pieceId']].strip().split('\n\n'),1) if p.strip()} if texts else original
        passages={p['passageId']:p for p in piece.get('evidence',{}).get('passages',[])}
        def change(item,source,path,**extra):
            try: result=resolve(item.get('quote'),source)
            except ValueError as error:
                expanded = disambiguate_repeated_literal(item.get('quote'), source)
                if expanded is None:
                    raise ValueError(f"pieces[{row_index}] ({piece['pieceId']}).{path}: {error}") from error
                result = resolve(expanded, source)
                result['before'] = item.get('quote')
            if result['before'] != result['after']:
                adjustments.append(dict(pieceId=piece['pieceId'],field=path,**extra,**result));item['quote']=result['after']
        for field in ('protect','changes','factualConcerns','issues','lostUsefulDetails'):
            for index,item in enumerate(row.get(field,[])):
                path=f'{field}[{index}]'
                paragraphs=current if field == 'issues' else original
                if item.get('paragraphId') in paragraphs:
                    change(item,paragraphs[item['paragraphId']],path+'.quote',paragraphId=item['paragraphId'])
                for ev_index,ev in enumerate(item.get('evidence',[])):
                    passage=passages.get(ev.get('passageId'))
                    if passage: change(ev,passage['quote'],path+f'.evidence[{ev_index}].quote',passageId=passage['passageId'],sourceId=passage.get('sourceId'))
    return adjustments

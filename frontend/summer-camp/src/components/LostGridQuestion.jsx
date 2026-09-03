import { useMemo, useState } from "react";
import CodingPlayground from "./CodingPlayGround";

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

export default function LostGridQuestion({ question, onSubmit, onClose }) {
  const { question_type: type, content = {} } = question;
  const [value, setValue] = useState("");
  const [order, setOrder] = useState(() => shuffle(content.items || []));
  const [pairs, setPairs] = useState({});
  const right = useMemo(() => shuffle(content.right || Object.values(content.pairs || {})), [question.id]);
  const left = content.left || Object.keys(content.pairs || {});

  if (type === "interactive_coding") return <CodingPlayground content={content} storageKey={`lost-grid-${question.id}`} onResult={setValue} onExit={onClose} onNext={(result) => onSubmit(result || value)} isLast exitLabel="Leave Grid" finishLabel="Defeat Enemy" />;
  const prompt = content.question || content.prompt || content.task || content.instruction || "Complete the challenge.";
  const submit = (result = value) => onSubmit(result);
  const swap = (from, to) => setOrder((current) => { const next = [...current]; [next[from], next[to]] = [next[to], next[from]]; return next; });

  return <div className="lgq">
    <div className="lgq-type">{type.replaceAll("_", " ")}</div><h2>{prompt}</h2>
    {type === "multiple_choice" && <div className="lgq-options">{(content.options || []).map((option) => <button key={option} className={value === option ? "selected" : ""} onClick={() => { setValue(option); submit(option); }}>{option}<span>›</span></button>)}</div>}
    {type === "true_false" && <div className="lgq-options two"><button onClick={() => submit(true)}>TRUE</button><button onClick={() => submit(false)}>FALSE</button></div>}
    {["fill_blank", "prompt_build", "image_reveal"].includes(type) && <><textarea rows={type === "prompt_build" ? 5 : 2} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Enter your answer…" /><button className="lgq-submit" disabled={!value.trim()} onClick={() => submit()}>Submit answer</button></>}
    {type === "drag_order" && <><p className="lgq-help">Use the arrows to arrange the sequence.</p><div className="lgq-order">{order.map((item, index) => <div key={`${item}-${index}`}><span>{index + 1}</span><strong>{item}</strong><button disabled={!index} onClick={() => swap(index, index - 1)}>↑</button><button disabled={index === order.length - 1} onClick={() => swap(index, index + 1)}>↓</button></div>)}</div><button className="lgq-submit" onClick={() => submit(order)}>Check order</button></>}
    {type === "match_pairs" && <><p className="lgq-help">Choose the matching answer for each item.</p><div className="lgq-pairs">{left.map((item) => <label key={item}><strong>{item}</strong><select value={pairs[item] || ""} onChange={(e) => setPairs({ ...pairs, [item]: e.target.value })}><option value="">Match…</option>{right.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}</div><button className="lgq-submit" disabled={Object.keys(pairs).length !== left.length} onClick={() => submit(pairs)}>Check matches</button></>}
    {!(["multiple_choice", "true_false", "fill_blank", "prompt_build", "image_reveal", "drag_order", "match_pairs", "interactive_coding"].includes(type)) && <><p className="lgq-help">This activity is supported by the Academy’s normal question system.</p><textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your response…" /><button className="lgq-submit" onClick={() => submit()}>Submit</button></>}
  </div>;
}

import { roundY } from "../utils/helpers";

export default function ProfitStr({ n }) {
  const r = roundY(n);
  const s = { fontSize: "0.75em", fontWeight: "inherit", fontFamily: "inherit" };
  if (r > 0) return <>{`+${r.toLocaleString()}`}<span style={s}>円</span></>;
  if (r < 0) return <>{`-${Math.abs(r).toLocaleString()}`}<span style={s}>円</span></>;
  return <>±0<span style={s}>円</span></>;
}

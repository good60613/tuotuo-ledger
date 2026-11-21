// 3.0 說明區的小圖：全部是程式畫的 SVG，顏色只用 CSS 變數（亮色、暗色都看得清楚）。
// 動畫寫在 styles.css（「3.0 說明區」），系統開「減少動態效果」時停止。

function Hand() {
  return (
    <g class="hf-hand-shape">
      <circle cx="0" cy="0" r="9" fill="var(--text)" opacity=".18" />
      <circle cx="0" cy="0" r="4.5" fill="var(--text)" opacity=".75" />
    </g>
  );
}

function Card({ x, y, name, cls }: { x: number; y: number; name: string; cls?: string }) {
  return (
    <g class={cls} transform={`translate(${x} ${y})`}>
      <g class="hf-inner">
        <rect width="90" height="46" rx="10" fill="var(--card)" stroke="var(--accent)" stroke-width="2" />
        <circle cx="18" cy="23" r="9" fill="var(--accent)" />
        <text x="34" y="27" font-size="12" fill="var(--text)">{name}</text>
      </g>
    </g>
  );
}

/** 按住帳戶卡，拖到「支出」放開＝記一筆支出 */
export function FigDragExpense() {
  return (
    <svg class="help-fig" viewBox="0 0 240 160" role="img" aria-label="按住帳戶卡，拖到支出區放開，就會記一筆支出">
      <rect x="0" y="0" width="240" height="160" rx="12" fill="var(--bg)" stroke="var(--line)" />
      <Card x={75} y={14} name="銀行" cls="hf-move-down" />
      <rect x="20" y="102" width="95" height="40" rx="10" fill="none" stroke="var(--expense)" stroke-width="2" stroke-dasharray="5 4" class="hf-zone" />
      <text x="67.5" y="127" text-anchor="middle" font-size="14" fill="var(--expense)">支出</text>
      <rect x="125" y="102" width="95" height="40" rx="10" fill="none" stroke="var(--income)" stroke-width="2" stroke-dasharray="5 4" />
      <text x="172.5" y="127" text-anchor="middle" font-size="14" fill="var(--income)">收入</text>
      <g transform="translate(110 40)"><g class="hf-move-down"><Hand /></g></g>
    </svg>
  );
}

/** 卡片拖到另一張卡片＝轉帳 */
export function FigTransfer() {
  return (
    <svg class="help-fig" viewBox="0 0 240 130" role="img" aria-label="把一張帳戶卡拖到另一張卡上放開，就是轉帳">
      <rect x="0" y="0" width="240" height="130" rx="12" fill="var(--bg)" stroke="var(--line)" />
      <Card x={135} y={24} name="現金" />
      <Card x={15} y={24} name="銀行" cls="hf-move-right" />
      <g transform="translate(45 47)"><g class="hf-move-right"><Hand /></g></g>
      <text x="120" y="104" text-anchor="middle" font-size="13" fill="var(--muted)">放開後＝從銀行轉到現金</text>
    </svg>
  );
}

function Row({ y, sign, label, color }: { y: number; sign: string; label: string; color: string }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x="12" y="0" width="216" height="28" rx="8" fill="var(--card)" stroke="var(--line)" />
      <text x="28" y="19" font-size="14" font-weight="700" fill={color}>{sign}</text>
      <text x="50" y="19" font-size="13" fill="var(--text)">{label}</text>
    </g>
  );
}

/** 剩餘可用的算式 */
export function FigRemaining() {
  return (
    <svg class="help-fig" viewBox="0 0 240 204" role="img" aria-label="剩餘可用等於一般帳戶合計，減預算、減定期扣款、減還沒還朋友的錢">
      <rect x="0" y="0" width="240" height="204" rx="12" fill="var(--bg)" stroke="var(--line)" />
      <Row y={10} sign="" label="一般帳戶合計" color="var(--text)" />
      <Row y={44} sign="−" label="未付的預算" color="var(--budget)" />
      <Row y={78} sign="−" label="定期扣款（這期還沒扣的）" color="var(--expense)" />
      <Row y={112} sign="−" label="還沒還朋友的錢（先欠）" color="var(--expense)" />
      <line x1="20" y1="150" x2="220" y2="150" stroke="var(--line)" stroke-width="2" />
      <rect x="12" y="160" width="216" height="34" rx="10" fill="var(--accent)" />
      <text x="120" y="183" text-anchor="middle" font-size="16" font-weight="700" fill="var(--on-color, #fff)">＝ 剩餘可用</text>
    </svg>
  );
}

/** 平均／日：剩餘可用 ÷ 離結算日天數 */
export function FigDaily() {
  const cells = [];
  for (let i = 0; i < 21; i++) {
    const cx = 12 + (i % 7) * 22;
    const cy = 40 + Math.floor(i / 7) * 22;
    const today = i === 6;
    const settle = i === 20;
    const between = i > 6 && i < 20;
    cells.push(
      <g key={i}>
        <rect x={cx} y={cy} width="19" height="19" rx="5" fill={today ? 'var(--accent)' : settle ? 'var(--budget)' : 'var(--card)'} stroke="var(--line)" />
        {between && <circle cx={cx + 9.5} cy={cy + 9.5} r="2" fill="var(--muted)" />}
      </g>,
    );
  }
  return (
    <svg class="help-fig" viewBox="0 0 240 150" role="img" aria-label="平均每日等於剩餘可用除以離結算日的天數">
      <rect x="0" y="0" width="240" height="150" rx="12" fill="var(--bg)" stroke="var(--line)" />
      <text x="12" y="24" font-size="12" fill="var(--muted)">日曆（藍＝今天，橘＝結算日）</text>
      {cells}
      <text x="12" y="132" font-size="12" fill="var(--muted)">中間的點＝要撐過的天數（不含今天）</text>
      <text x="180" y="62" text-anchor="middle" font-size="11" fill="var(--muted)">例：</text>
      <text x="180" y="84" text-anchor="middle" font-size="13" fill="var(--text)">$9,000</text>
      <text x="180" y="102" text-anchor="middle" font-size="13" fill="var(--muted)">÷ 14 天</text>
      <line x1="150" y1="108" x2="210" y2="108" stroke="var(--line)" />
      <text x="180" y="126" text-anchor="middle" font-size="14" font-weight="700" fill="var(--income)">≈ $643／天</text>
    </svg>
  );
}

function Box({ x, n, title, sub }: { x: number; n: string; title: string; sub: string }) {
  return (
    <g transform={`translate(${x} 30)`}>
      <rect width="62" height="64" rx="10" fill="var(--card)" stroke="var(--accent)" stroke-width="2" />
      <circle cx="10" cy="-2" r="9" fill="var(--accent)" />
      <text x="10" y="2" text-anchor="middle" font-size="11" font-weight="700" fill="var(--on-color, #fff)">{n}</text>
      <text x="31" y="34" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">{title}</text>
      <text x="31" y="52" text-anchor="middle" font-size="10" fill="var(--muted)">{sub}</text>
    </g>
  );
}

/** 從其他軟體匯入：舊檔案 → AI → 匯回拖拖記帳 */
export function FigImport() {
  return (
    <svg class="help-fig" viewBox="0 0 240 130" role="img" aria-label="三步驟：選舊檔案，交給 AI，把 AI 做好的檔案匯回拖拖記帳">
      <rect x="0" y="0" width="240" height="130" rx="12" fill="var(--bg)" stroke="var(--line)" />
      <Box x={10} n="1" title="舊檔案" sub="舊 App 匯出" />
      <Box x={89} n="2" title="AI" sub="轉成新格式" />
      <Box x={168} n="3" title="拖拖記帳" sub="匯入備份" />
      <path d="M76 62 L86 62 M82 58 L86 62 L82 66" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M155 62 L165 62 M161 58 L165 62 L161 66" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <text x="120" y="116" text-anchor="middle" font-size="11" fill="var(--muted)">核對餘額和筆數沒問題，再按取代</text>
    </svg>
  );
}

/** 明細：長按一筆拖曳換位置，或拖到垃圾桶 */
export function FigDetailDrag() {
  return (
    <svg class="help-fig" viewBox="0 0 240 150" role="img" aria-label="明細長按一筆再拖，可以換位置，拖到垃圾桶可以刪除">
      <rect x="0" y="0" width="240" height="150" rx="12" fill="var(--bg)" stroke="var(--line)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(16 ${14 + i * 34})`}>
          <rect width="150" height="28" rx="8" fill="var(--card)" stroke="var(--line)" />
          <circle cx="14" cy="14" r="6" fill="var(--muted)" opacity=".5" />
          <rect x="28" y="10" width={60 - i * 8} height="8" rx="4" fill="var(--muted)" opacity=".4" />
        </g>
      ))}
      <rect x="182" y="40" width="44" height="60" rx="10" fill="none" stroke="var(--expense)" stroke-width="2" stroke-dasharray="5 4" />
      <text x="204" y="74" text-anchor="middle" font-size="11" fill="var(--expense)">垃圾桶</text>
      <text x="120" y="136" text-anchor="middle" font-size="11" fill="var(--muted)">長按一筆再拖：上下換位置，或丟進垃圾桶</text>
    </svg>
  );
}

// 3.0 說明區：設定頁「說明」子畫面。先看目錄，點一篇進去看；返回鍵先回目錄。
import { useEffect, useState } from 'preact/hooks';
import { ARTICLES } from '../help/articles';
import { goPage, pageIndex, setState } from '../store';
import { useBackLayer } from '../backNav';
import { Icon } from './Icon';

export function HelpPage() {
  const [open, setOpen] = useState<string | null>(null);
  useBackLayer(open !== null, () => setOpen(null));
  const art = ARTICLES.find((a) => a.id === open);
  // 換篇或回目錄時捲回最上面（只捲設定這一頁）
  useEffect(() => {
    document.querySelector('.page[data-page="設定"]')?.scrollTo({ top: 0 });
  }, [open]);

  if (art) {
    return (
      <section class="panel help-article">
        <button class="help-back" onClick={() => setOpen(null)}>
          <Icon name="chevron-left" size={16} /> 回到目錄
        </button>
        <h3>{art.title}</h3>
        {art.body()}
      </section>
    );
  }

  return (
    <section class="panel">
      <button
        class="btn secondary block"
        onClick={() => {
          setState({ tutorial: true });
          goPage(pageIndex('首頁'));
        }}
      >
        重看新手教學
      </button>
      <div class="help-list">
        {ARTICLES.map((a) => (
          <button key={a.id} class="help-item" onClick={() => setOpen(a.id)}>
            <b>{a.title}</b>
            <span>{a.summary}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

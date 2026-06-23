export interface DiffLine {
  type: 'ctx' | 'add' | 'del';
  oldNo: number | null;
  newNo: number | null;
  text: string;
}
export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

/** Prosty diff liniowy (LCS) — wystarczający dla dokumentów Markdown. */
export function lineDiff(oldText: string, newText: string): DiffResult {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;
  let additions = 0;
  let deletions = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: 'ctx', oldNo: oldNo++, newNo: newNo++, text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'del', oldNo: oldNo++, newNo: null, text: a[i] });
      i++;
      deletions++;
    } else {
      lines.push({ type: 'add', oldNo: null, newNo: newNo++, text: b[j] });
      j++;
      additions++;
    }
  }
  while (i < n) {
    lines.push({ type: 'del', oldNo: oldNo++, newNo: null, text: a[i++] });
    deletions++;
  }
  while (j < m) {
    lines.push({ type: 'add', oldNo: null, newNo: newNo++, text: b[j++] });
    additions++;
  }

  return { lines, additions, deletions };
}

export interface TemplateVars {
  date: string;
  time: string;
  title: string;
}

export function todayString(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{date:YYYY-MM-DD\}\}/g, vars.date)
    .replace(/\{\{date\}\}/g, vars.date)
    .replace(/\{\{time\}\}/g, vars.time)
    .replace(/\{\{title\}\}/g, vars.title);
}

export type Duration = string;
export type Milliseconds = number;
export const parseDuration = (d: Duration): Milliseconds => {
  const matches = d.match(
    /^((?<days>\d+)d)?((?<hours>\d+)h)?((?<minutes>\d+)m)?((?<seconds>\d+)s)?((?<milliseconds>\d+)ms)?$/,
  );
  if (!matches) {
    return 0;
  }
  const groups = matches.groups;
  if (!groups) {
    return 0;
  }
  const { days, hours, minutes, seconds, milliseconds } = groups;
  const v = (s: string | undefined, m: number = 1) =>
    (parseInt(s || "0") || 0) * m;
  const m = (x: number, os: number[]) =>
    os.reduce((sum, o) => sum + (o * x), 0);
  return v(milliseconds) + m(1000, [
    v(seconds),
    m(60, [
      v(minutes),
      m(60, [
        v(hours),
        m(24, [
          v(days),
        ]),
      ]),
    ]),
  ]);
};

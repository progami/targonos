export type TimeSeriesPoint = { t: Date; value: number };

export function alignPointsToDs(args: {
  ds: number[];
  points: TimeSeriesPoint[];
  label: string;
}): number[] {
  const valueByT = new Map<number, number>();
  for (const point of args.points) {
    valueByT.set(Math.floor(point.t.getTime() / 1000), point.value);
  }

  return args.ds.map((t) => {
    const value = valueByT.get(t);
    if (value === undefined) {
      throw new Error(`${args.label} is missing a value for ${new Date(t * 1000).toISOString()}.`);
    }
    return value;
  });
}


// A short fingerprint of the records matching `filter`: how many there are and when the
// newest change was made. It changes whenever one is added, edited, or deleted, so the
// app can tell a list changed without downloading it.
export const stampOf = async (Model, filter = {}) => {
  const [count, latest] = await Promise.all([
    Model.countDocuments(filter),
    Model.findOne(filter).sort({ updatedAt: -1 }).select('updatedAt').lean()
  ]);
  return `${count}:${latest?.updatedAt ? new Date(latest.updatedAt).getTime() : 0}`;
};

let count = 0;

export default defineEventHandler(async (event) => {
  const { id } = await readBody(event);
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });
  count++;
  return { count };
});

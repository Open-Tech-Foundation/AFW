// A native addon in a server route: sharp's libvips binding resizes the posted image.
import sharp from "sharp";

export async function POST(request, { query }) {
  const width = Number(query.width ?? 16);
  const image = await sharp(Buffer.from(await request.arrayBuffer())).resize(width).webp().toBuffer();
  return new Response(image, { headers: { "content-type": "image/webp" } });
}

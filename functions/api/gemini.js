import { handler as writerHandler } from './ai-writer.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const event = {
    httpMethod: context.request.method,
    body: await (context.request.method === 'GET' || context.request.method === 'HEAD' ? Promise.resolve(null) : context.request.text()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    path: url.pathname,
    rawUrl: url.toString(),
    pathParameters: {}
  };
  const result = await writerHandler(event, context.env);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}

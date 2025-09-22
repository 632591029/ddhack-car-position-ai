// Cloudflare Functions for API proxy
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 处理CORS预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    // 提取路径参数
    const pathParts = url.pathname.split('/').filter(Boolean);
    const apiPath = pathParts.slice(1).join('/'); // 去掉 'api' 前缀

    let targetUrl;

    // 根据路径判断目标API
    if (apiPath.startsWith('oauth/')) {
      targetUrl = `https://aip.baidubce.com/${apiPath}`;
    } else if (apiPath.startsWith('baidu/')) {
      targetUrl = `https://aip.baidubce.com/${apiPath.replace('baidu/', '')}`;
    } else {
      return new Response('API path not found', { status: 404 });
    }

    // 转发请求
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'Origin': 'https://aip.baidubce.com',
        'Referer': 'https://aip.baidubce.com'
      },
      body: request.method !== 'GET' ? await request.text() : undefined,
    });

    const response = await fetch(modifiedRequest);
    const responseBody = await response.text();

    // 返回响应并添加CORS头
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('API Proxy Error:', error);
    return new Response(`Proxy Error: ${error.message}`, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      }
    });
  }
}
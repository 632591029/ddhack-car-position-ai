// Cloudflare Pages Functions for API proxy
export async function onRequestPost(context) {
  return handleRequest(context);
}

export async function onRequestGet(context) {
  return handleRequest(context);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleRequest(context) {
  const { request, params } = context;
  const path = params.path.join('/');

  console.log('API Request:', request.method, path);

  try {
    let targetUrl;

    // 路由规则
    if (path.startsWith('oauth/')) {
      targetUrl = `https://aip.baidubce.com/${path}`;
    } else if (path.startsWith('baidu/')) {
      targetUrl = `https://aip.baidubce.com/${path.replace('baidu/', '')}`;
    } else {
      return new Response('Invalid API path', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log('Proxying to:', targetUrl);

    // 构建代理请求
    const proxyHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CloudFlare-Pages-Function/1.0'
    };

    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    // 发送请求到百度API
    const response = await fetch(proxyRequest);
    const responseText = await response.text();

    console.log('Response:', response.status, responseText.length);

    return new Response(responseText, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });

  } catch (error) {
    console.error('Proxy error:', error);

    return new Response(JSON.stringify({
      error: 'Proxy failed',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      }
    });
  }
}
export async function onRequest(context) {
  var request = context.request;
  var params = context.params;

  // CORS预检请求
  if (request.method === 'OPTIONS') {
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

  try {
    var path = params.path.join('/');
    var targetUrl;

    // 路由到百度API
    if (path.indexOf('oauth/') === 0) {
      targetUrl = 'https://aip.baidubce.com/' + path;
    } else if (path.indexOf('baidu/') === 0) {
      targetUrl = 'https://aip.baidubce.com/' + path.replace('baidu/', '');
    } else {
      return new Response('Invalid API path', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 构建请求
    var requestOptions = {
      method: request.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CloudFlare-Pages-Function/1.0'
      }
    };

    // 添加请求体
    if (request.method === 'POST') {
      requestOptions.body = await request.text();
    }

    // 发送请求
    var response = await fetch(targetUrl, requestOptions);
    var responseText = await response.text();

    // 返回响应
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
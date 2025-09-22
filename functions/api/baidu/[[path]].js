export async function onRequest(context) {
  return proxyToBaidu(context, 'baidu');
}

async function proxyToBaidu(context, prefix) {
  var request = context.request;

  if (request.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    var url = new URL(request.url);
    var apiPath = url.pathname.replace('/api/baidu/', '');
    var targetUrl = 'https://aip.baidubce.com/' + apiPath;

    var requestOptions = {
      method: request.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CF-Pages-Function/1.0'
      }
    };

    if (request.method === 'POST') {
      requestOptions.body = await request.text();
    }

    var response = await fetch(targetUrl, requestOptions);
    var responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: corsHeaders(response)
    });

  } catch (error) {
    return errorResponse(error);
  }
}

function corsResponse() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}

function corsHeaders(response) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': response.headers.get('Content-Type') || 'application/json',
  };
}

function errorResponse(error) {
  return new Response(JSON.stringify({
    error: 'Proxy failed',
    message: error.message
  }), {
    status: 500,
    headers: corsHeaders({ headers: { get: () => 'application/json' } })
  });
}
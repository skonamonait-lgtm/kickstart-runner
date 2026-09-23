
const express = require('express');
const axios = require('axios');
const { Webhook } = require('standardwebhooks');
const app = express();
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl === '/yoco-webhook') {
            req.rawBody = buf;
        }
    }
}));
app.use(express.static('public'));

// ==========================================
// 🔴 PRODUCTION CONFIGURATION BOX
// ==========================================
const YOCO_SECRET_KEY = process.env.YOCO_TEST_SECRET_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const VERIFY_TOKEN = "kickstart_runner_secret_2026";
const META_APP_ID = "1104151632136488";
const META_APP_SECRET = "b6dd239872549742f5d4ef6617710216";

// Meta OAuth Code Exchange
app.post('/exchange-code', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code missing' });
        }

        const response = await axios.get(
            'https://graph.facebook.com/v26.0/oauth/access_token',
            {
                params: {
                    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    code: code,
    redirect_uri: 'https://kickstart-runner-production.onrender.com/'
                }
            }
        );

        console.log('✅ Meta authorization code exchanged successfully');

        return res.json({
            success: true,
            message: 'Meta authorization successful'
        });

    } catch (error) {
        console.error(
            '❌ Meta code exchange failed:',
            error.response?.data || error.message
        );

        return res.status(500).json({
            success: false,
            error: 'Meta authorization exchange failed'
        });
    }
});
// 1. Meta Webhook Handshake Validation
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Meta Webhook successfully verified!');
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

// 2. Clear Outbound Message Delivery Engine
async function sendWhatsAppMessage(recipientPhone, messageText) {
    try {
        const targetUrl = `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`;
        await axios.post(targetUrl,
            { messaging_product: "whatsapp", recipient_type: "individual", to: recipientPhone, type: "text", text: { preview_url: true, body: messageText } },
            { headers: { 'Authorization': 'Bearer ' + META_ACCESS_TOKEN.trim(), 'Content-Type': 'application/json' } }
        );
        console.log(`✉️ Outbound WhatsApp text pushed successfully to customer!`);
    } catch (metaError) {
        console.error("❌ Outbound WhatsApp delivery failed:", metaError.response?.data || metaError.message);
    }
}
// 3. Approved WhatsApp Order Confirmation Template
async function sendOrderConfirmationTemplate(recipientPhone, customerName, orderNumber, orderTotal) {
    try {
        const targetUrl = `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`;

        await axios.post(
            targetUrl,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipientPhone,
                type: "template",
                template: {
                    name: "runner_order_confirmation",
                    language: {
                        code: "en"
                    },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                {
                                    type: "text",
                                    text: customerName
                                },
                                {
                                    type: "text",
                                    text: orderNumber
                                },
                                {
                                    type: "text",
                                    text: orderTotal
                                }
                            ]
                        }
                    ]
                }
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + META_ACCESS_TOKEN.trim(),
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✉️ Order confirmation template sent successfully to ${recipientPhone}`);
    } catch (metaError) {
        console.error(
            "❌ Order confirmation template failed:",
            metaError.response?.data || metaError.message
        );
    }
}
// ==========================================
// YOCO PAYMENT WEBHOOK
// ==========================================
app.post('/yoco-webhook', (req, res) => {
    console.log("💳 Yoco webhook received");

    try {
        const webhook = new Webhook(process.env.YOCO_WEBHOOK_SECRET);

        const event = webhook.verify(
            req.rawBody,
            req.headers
        );

        console.log("✅ Yoco webhook signature verified");
        console.log("📦 Event:", event);

        res.sendStatus(200);

    } catch (error) {
        console.error("❌ Yoco webhook verification failed:", error.message);
        res.sendStatus(400);
    }
});
app.get('/create-yoco-subscription', async (req, res) => {
if (req.query.key !== 'kickstart2026') return res.sendStatus(403);
    try {
        const response = await axios.post(
            'https://api.yoco.com/v1/webhooks/subscriptions/',
            {
                event_types: ['payment.created'],
                name: 'Kickstart Runner Payments',
                notification_url: 'https://kickstart-runner-production.onrender.com/yoco-webhook'
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + process.env.YOCO_WEBHOOK_API_KEY.trim(),
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Yoco subscription created:", response.data);

        res.json(response.data);

    } catch (error) {
        console.error(
            "❌ Yoco subscription failed:",
            error.response?.data || error.message
        );

        res.status(500).json({
            error: error.response?.data || error.message
        });
    }
});
// TEST YOCO WEBHOOK
app.get('/test-yoco-webhook', async (req, res) => {
    if (req.query.key !== 'kickstart2026') return res.sendStatus(403);

    try {
        const response = await axios.post(
            'https://api.yoco.com/v1/webhooks/subscriptions/ep_3Jg8Cu3nf9qhA7He4GZmx4cOLFx/test',
            { event_type: 'payment.created' },
            {
                headers: {
                    'Authorization': 'Bearer ' + process.env.YOCO_WEBHOOK_API_KEY.trim(),
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Yoco test webhook requested:", response.data);
        res.json(response.data);

    } catch (error) {
        console.error(
            "❌ Yoco test webhook failed:",
            error.response?.data || error.message
        );

        res.status(500).json({
            error: error.response?.data || error.message
        });
    }
});
// 3. Main Processing Router
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account' && body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            
            const messageData = body.entry[0].changes[0].value.messages[0];
            const contactData = body.entry[0].changes[0].value.contacts && body.entry[0].changes[0].value.contacts[0] ? body.entry[0].changes[0].value.contacts[0] : null;
            
            const customerPhone = messageData.from; 
            const customerName = contactData && contactData.profile ? contactData.profile.name : "Customer";
            
            console.log(`\n========================================`);
            console.log(`📱 CONNECTED USER INTERACTION: ${customerName} (${customerPhone})`);

            // 🛒 MODE A: Incoming Shopping Carts (Active customer orders)
            if (messageData.type === 'order') {
                const orderItems = messageData.order.product_items;
                const orderNumber = `KR-${Date.now()}`;
                console.log(`🛒 Cart contents detected! Summarizing grand total...`);
                
                let produceTotalCents = 0;
                orderItems.forEach(item => {
                    const itemPriceCents = Math.round(parseFloat(item.item_price) * 100);
                    const quantity = parseInt(item.quantity);
                    produceTotalCents += (itemPriceCents * quantity);
                    console.log(`   - SKU: ${item.product_retailer_id} | Qty: ${quantity} | Price: R${item.item_price}`);
                });

                const deliveryFeeCents = 5000; 
                const grandTotalCents = produceTotalCents + deliveryFeeCents;
                const grandTotalRand = (grandTotalCents / 100).toFixed(2);
const orderRecord = {
    orderNumber,
    customerName,
    customerPhone,
    items: orderItems,
    produceTotalCents,
    deliveryFeeCents,
    grandTotalCents,
    paymentStatus: "PENDING",
    orderStatus: "NEW"
};

console.log("📋 ORDER TICKET CREATED:");
console.log(orderRecord);
await sendOrderConfirmationTemplate(
    customerPhone,
    customerName,
    orderNumber,
    grandTotalRand
);
                
                console.log(`🎯 Target Total Bill Calculation: R${grandTotalRand}`);

                let checkoutUrl = "";
                try {
                    const yocoResponse = await axios.post('https://payments.yoco.com/api/checkouts', 
                        { amount: grandTotalCents, currency: "ZAR", successUrl: "https://kickstartresellers.co.za/payment-success" },
                        { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                    );
                    checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                } catch (yocoError) {
                    console.log("❌ Production Endpoint failed, checking staging fallback...");
                    try {
                        const fallbackResponse = await axios.post('https://payments.yoco.com/api/checkouts', 
                            { amountInCents: grandTotalCents, currency: "ZAR", successUrl: "https://whatsapp.com" },
                            { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                        );
                        checkoutUrl = fallbackResponse.data.redirectUrl || fallbackResponse.data.url;
                    } catch (err) {
                        console.error("❌ Double API Authentication Failure:", err.response?.data || err.message);
                    }
                }
                
               if (checkoutUrl) {
    console.log(`🔥 YOCO HOSTED INVOICE READY: ${checkoutUrl}`);

    const customerPaymentText = `💳 Payment link for order ${orderNumber}\n\n💰 Produce Subtotal: R${(produceTotalCents/100).toFixed(2)}\n🚚 Reseller Delivery: R50.00\n💵 *Grand Total: R${grandTotalRand}*\n\n🔒 Please use the secure link below to complete your payment:\n👉 ${checkoutUrl}\n\nYour order will be confirmed for delivery once payment is received. 🥦🚚`;

    await sendWhatsAppMessage(customerPhone, customerPaymentText);
} else {
    console.log("⚠️ Yoco checkout link was not created. Order confirmation was still sent.");
}
                
            // 💬 MODE B: Regular Text Messages (Dashboard Test Trigger)
            } else if (messageData.type === 'text') {
                const textReceived = messageData.text.body.toLowerCase().trim();
                console.log(`💬 Inbound text received: "${textReceived}"`);

                if (textReceived === 'test' || textReceived === 'this is a text message') {
                    console.log(`🔄 Test sequence engaged! Requesting live link...`);
                    
                    let checkoutUrl = "";
                    try {
                        const yocoResponse = await axios.post('https://payments.yoco.com/api/checkouts', 
                            { amount: 15000, currency: "ZAR", successUrl: "https://whatsapp.com" },
                            { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                        );
                        checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                    } catch (yocoError) {
                        console.log("❌ Production Endpoint failed, checking staging fallback...");
                        try {
                            const fallbackResponse = await axios.post('https://payments.yoco.com/api/checkouts', 
                                { amountInCents: 15000, currency: "ZAR", successUrl: "https://whatsapp.com" },
                                { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                            );
                            checkoutUrl = fallbackResponse.data.redirectUrl || fallbackResponse.data.url;
                        } catch (err) {
                            console.error("❌ Double API Authentication Failure:", err.response?.data || err.message);
                        }
                    }
                    
                    if (checkoutUrl) {
                        console.log(`🔥 YOCO MOCK INVOICE READY: ${checkoutUrl}`);
                        const testMessageBody = `Hello! This is a live end-to-end connection confirmation from Kickstart Resellers. Your mock balance total including delivery is *R150.00*. Process sample checkout here: ${checkoutUrl}`;
                        await sendWhatsAppMessage(customerPhone, testMessageBody);
                    }
                }
            }
            console.log(`========================================\n`);
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error("❌ Internal script processing exception:", error);
        return res.sendStatus(500);
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
    console.log(`🚀 Kickstart Runner Production Engine listening on port ${PORT}`)
);
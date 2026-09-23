
const express = require('express');
const axios = require('axios');
const { Webhook } = require('standardwebhooks');
const app = express();
// ==========================================
// CUSTOMER CONVERSATION STATE
// ==========================================
const customerStates = {};
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
app.post('/yoco-webhook', async (req, res) => {
    console.log("💳 Yoco webhook received");

    try {
        const webhook = new Webhook(process.env.YOCO_CHECKOUT_WEBHOOK_SECRET);

        const event = webhook.verify(
            req.rawBody,
            req.headers
        );

        console.log("✅ Yoco webhook signature verified");
        console.log("📦 Event:", event);
        const checkoutId = event.payload?.metadata?.checkoutId;
        console.log("🔑 Checkout ID:", checkoutId);
        const order = Object.values(customerStates)
    .find(state => state.orderRecord?.yocoCheckoutId === checkoutId);

console.log("🔎 Looking for Checkout ID:", checkoutId);
console.log("🔎 Stored Checkout IDs:", Object.values(customerStates).map(state => state.orderRecord?.yocoCheckoutId));
console.log("📋 Matching order:", order?.orderRecord?.orderNumber || "NOT FOUND");
if (order?.orderRecord) {
    order.orderRecord.paymentStatus = "PAID";
    console.log("💰 PAYMENT STATUS: PAID ✅");
await sendWhatsAppMessage(
    order.customerPhone,
    `✅ Payment received.\nOrder *${order.orderRecord.orderNumber}* is confirmed.\nThank you, ${order.orderRecord.customerName}. We are preparing your order.`
);
}

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
customerStates[customerPhone] = {
    step: "NAME",
    orderNumber
};
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
                customerStates[customerPhone].items = orderItems;
customerStates[customerPhone].produceTotalCents = produceTotalCents;
customerStates[customerPhone].deliveryFeeCents = deliveryFeeCents;
customerStates[customerPhone].grandTotalCents = grandTotalCents;
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
customerStates[customerPhone].orderRecord = orderRecord;
await sendWhatsAppMessage(
    customerPhone,
    `Please confirm the name for your order.\n\nYour WhatsApp name is *${customerName}*.\n\nIf this is correct, reply *YES*.\nIf not, please reply with your full name.`
);

return res.sendStatus(200);
                
                console.log(`🎯 Target Total Bill Calculation: R${grandTotalRand}`);

                let checkoutUrl = "";
                try {
                    const yocoResponse = await axios.post('https://payments.yoco.com/api/checkouts', 
                        { amount: grandTotalCents, currency: "ZAR", successUrl: "https://kickstartresellers.co.za/payment-success" },
                        { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                    );
                    checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                    customerState.yocoCheckoutId = yocoResponse.data.id;
                    orderRecord.yocoCheckoutId = customerState.yocoCheckoutId;
                } catch (yocoError) {
                    console.log("❌ Production Endpoint failed, checking staging fallback...");
                    try {
                        const fallbackResponse = await axios.post('https://payments.yoco.com/api/checkouts', 
                            { amountInCents: grandTotalCents, currency: "ZAR", successUrl: "https://kickstartresellers.co.za/payment-successful/" },
                            { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                        );
                        checkoutUrl = fallbackResponse.data.redirectUrl || fallbackResponse.data.url;
                    } catch (err) {
                        console.error("❌ Double API Authentication Failure:", err.response?.data || err.message);
                    }
                }
                
               if (checkoutUrl) {
    console.log(`🔥 YOCO HOSTED INVOICE READY: ${checkoutUrl}`);

    const customerPaymentText = `💳 Payment link for order ${orderNumber}\n\n💰 Produce Subtotal: R${(produceTotalCents/100).toFixed(2)}\n🏃 Runner: R50.00\n💵 *Grand Total: R${grandTotalRand}*\n\n🔒 Please use the secure link below to complete your payment:\n👉 ${checkoutUrl}\n\nYour order will be confirmed once payment is received. 🥦🏃`;

    await sendWhatsAppMessage(customerPhone, customerPaymentText);
} else {
    console.log("⚠️ Yoco checkout link was not created. Order confirmation was still sent.");
}
                
            // 💬 MODE B: Regular Text Messages (Dashboard Test Trigger)
            } else if (messageData.type === 'text') {
                const textReceived = messageData.text.body.toLowerCase().trim();
                const customerState = customerStates[customerPhone];
                console.log(`💬 Inbound text received: "${textReceived}"`);
// Customer details flow
if (customerState && customerState.step === "NAME") {

    if (textReceived === "yes") {
        customerState.officialName = customerName;
    } else {
        customerState.officialName = messageData.text.body.trim();
    }

    customerState.step = "LOCATION";

    await sendWhatsAppMessage(
        customerPhone,
        `Thank you, ${customerState.officialName}. 📍\n\nPlease send us your delivery location.\n\nYou can type your address or use WhatsApp's location pin.`
    );

    return res.sendStatus(200);
}
// Customer location flow
if (customerState && customerState.step === "LOCATION") {

    customerState.location = messageData.text.body.trim();
    customerState.step = "TIME";

    await sendWhatsAppMessage(
        customerPhone,
        `Thank you. 📍\n\nWhat time would you prefer your Runner?\n\nPlease reply with a preferred time, for example:\n*14:00–16:00*\nor\n*16:00–18:00*`
    );

    return res.sendStatus(200);
}
// Customer time flow
if (customerState && customerState.step === "TIME") {

    customerState.runnerTime = messageData.text.body.trim();
    customerState.step = "INSTRUCTIONS";

    await sendWhatsAppMessage(
        customerPhone,
        `Thank you. 🏃\n\nDo you have any special instructions for your Runner?\n\nIf yes, please type them.\nIf none, reply *NONE*.`
    );

    return res.sendStatus(200);
}
// Customer instructions flow
if (customerState && customerState.step === "INSTRUCTIONS") {

    customerState.instructions = messageData.text.body.trim();
    customerState.step = "REVIEW";

    let itemsText = "";

    customerState.items.forEach(item => {
        const quantity = parseInt(item.quantity);
        const price = parseFloat(item.item_price);
        const lineTotal = (quantity * price).toFixed(2);

        itemsText += `${quantity} × ${item.product_retailer_id} — R${lineTotal}\n`;
    });

    const productsTotal = (customerState.produceTotalCents / 100).toFixed(2);
    const runnerFee = (customerState.deliveryFeeCents / 100).toFixed(2);
    const grandTotal = (customerState.grandTotalCents / 100).toFixed(2);

    await sendWhatsAppMessage(
        customerPhone,
        `🧾 *Please review your order*\n\n` +
        `*Name:* ${customerState.officialName}\n` +
        `*Location:* ${customerState.location}\n` +
        `*Runner time:* ${customerState.runnerTime}\n` +
        `*Instructions:* ${customerState.instructions}\n\n` +
        `*Items:*\n${itemsText}\n` +
        `Products: R${productsTotal}\n` +
        `Runner: R${runnerFee}\n` +
        `*TOTAL: R${grandTotal}*\n\n` +
        `If everything is correct, reply *YES*.\n` +
        `If something needs changing, reply *NO*.`
    );

    return res.sendStatus(200);
}
// Customer correction flow
if (customerState && customerState.step === "CORRECTION") {

    if (textReceived === "name") {

        customerState.step = "NAME";

        await sendWhatsAppMessage(
            customerPhone,
            `Please confirm the name for your order.\n\nYour current name is *${customerState.officialName}*.\n\nIf this is correct, reply *YES*.\nIf not, please reply with your full name.`
        );

        return res.sendStatus(200);
    }

    if (textReceived === "location") {

        customerState.step = "LOCATION";

        await sendWhatsAppMessage(
            customerPhone,
            `📍 Please send us your delivery location.\n\nYou can type your address or use WhatsApp's location pin.`
        );

        return res.sendStatus(200);
    }

    if (textReceived === "time") {

        customerState.step = "TIME";

        await sendWhatsAppMessage(
            customerPhone,
            `🏃 What time would you prefer your Runner?\n\nPlease reply with a preferred time, for example:\n*14:00–16:00*\nor\n*16:00–18:00*`
        );

        return res.sendStatus(200);
    }

    if (textReceived === "instructions") {

        customerState.step = "INSTRUCTIONS";

        await sendWhatsAppMessage(
            customerPhone,
            `Do you have any special instructions for your Runner?\n\nIf yes, please type them.\nIf none, reply *NONE*.`
        );

        return res.sendStatus(200);
    }

    await sendWhatsAppMessage(
        customerPhone,
        `Please reply with one of these:\n\n*NAME*\n*LOCATION*\n*TIME*\n*INSTRUCTIONS*`
    );

    return res.sendStatus(200);
}
// Customer review confirmation flow
if (customerState && customerState.step === "REVIEW") {

  if (textReceived === "yes") {

    customerState.step = "PAYMENT";

    let checkoutUrl = "";

    try {
        const yocoResponse = await axios.post(
            'https://payments.yoco.com/api/checkouts',
            {
                amount: customerState.grandTotalCents,
                currency: "ZAR",
                successUrl: "https://kickstartresellers.co.za/payment-successful/"
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(),
                    'Content-Type': 'application/json'
                }
            }
        );

        checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
        customerState.yocoCheckoutId = yocoResponse.data.id;
customerState.orderRecord.yocoCheckoutId = customerState.yocoCheckoutId;

    } catch (yocoError) {
        console.error(
            "❌ Yoco checkout creation failed:",
            yocoError.response?.data || yocoError.message
        );
    }

    if (checkoutUrl) {

        await sendWhatsAppMessage(
            customerPhone,
            `Thank you, ${customerState.officialName}. ✅\n\n` +
            `Your order *${customerState.orderNumber}* has been confirmed.\n\n` +
            `Total to pay: *R${(customerState.grandTotalCents / 100).toFixed(2)}*\n\n` +
            `💳 Please complete your payment here:\n${checkoutUrl}`
        );

    } else {

        customerState.step = "REVIEW";

        await sendWhatsAppMessage(
            customerPhone,
            `We are sorry, but we could not create your payment link just now. Please try again.`
        );
    }

    return res.sendStatus(200);
}

    if (textReceived === "no") {

customerState.step = "CORRECTION";

        await sendWhatsAppMessage(
            customerPhone,
            `No problem. 👍\n\nPlease tell us what you would like to change about your order.`
        );

        return res.sendStatus(200);
    }
}
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
                            customerState.yocoCheckoutId = fallbackResponse.data.id;
                            orderRecord.yocoCheckoutId = customerState.yocoCheckoutId;
                        } catch (err) {
                            console.error("❌ Double API Authentication Failure:", err.response?.data || err.message);
                        }
                    }
                    
                    if (checkoutUrl) {
                        console.log(`🔥 YOCO MOCK INVOICE READY: ${checkoutUrl}`);
                        const testMessageBody = `Hello! This is a live end-to-end connection confirmation from Kickstart Resellers. Your mock balance total including  Runner is *R150.00*. Process sample checkout here: ${checkoutUrl}`;
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
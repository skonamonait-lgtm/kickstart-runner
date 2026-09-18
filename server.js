const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// 🔴 PRODUCTION CONFIGURATION BOX
// ==========================================
const YOCO_SECRET_KEY = "sk_live_320c671blVxJLZn61884c54a69dc";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

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
    redirect_uri: 'https://antibodies-soup-later-injured.trycloudflare.com/'
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
        const targetUrl = 'https://facebook.com';
        await axios.post(targetUrl,
            { messaging_product: "whatsapp", recipient_type: "individual", to: recipientPhone, type: "text", text: { preview_url: true, body: messageText } },
            { headers: { 'Authorization': 'Bearer ' + META_ACCESS_TOKEN.trim(), 'Content-Type': 'application/json' } }
        );
        console.log(`✉️ Outbound WhatsApp text pushed successfully to customer!`);
    } catch (metaError) {
        console.error("❌ Outbound WhatsApp delivery failed:", metaError.response?.data || metaError.message);
    }
}

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
                
                console.log(`🎯 Target Total Bill Calculation: R${grandTotalRand}`);

                let checkoutUrl = "";
                try {
                    const yocoResponse = await axios.post('https://yoco.com', 
                        { amount: grandTotalCents, currency: "ZAR", successUrl: "https://whatsapp.com" },
                        { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                    );
                    checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                } catch (yocoError) {
                    console.log("❌ Production Endpoint failed, checking staging fallback...");
                    try {
                        const fallbackResponse = await axios.post('https://yoco.com', 
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
                    const customerInvoiceText = `Hi ${customerName}! 👋\n\nThank you for ordering with Kickstart Resellers. We've verified your farm produce cart items:\n\n💰 Produce Subtotal: R${(produceTotalCents/100).toFixed(2)}\n🚚 Reseller Delivery: R50.00\n💵 *Grand Total: R${grandTotalRand}*\n\n🔒 Click the link below to settle securely via card or device payment:\n👉 ${checkoutUrl}\n\nYour fresh crate locks in for delivery immediately upon payment confirmation! 🥦🚚`;
                    await sendWhatsAppMessage(customerPhone, customerInvoiceText);
                } else {
                    console.log("⚠️ Link parsing rejected by Gateway constraints.");
                }
                
            // 💬 MODE B: Regular Text Messages (Dashboard Test Trigger)
            } else if (messageData.type === 'text') {
                const textReceived = messageData.text.body.toLowerCase().trim();
                console.log(`💬 Inbound text received: "${textReceived}"`);

                if (textReceived === 'test' || textReceived === 'this is a text message') {
                    console.log(`🔄 Test sequence engaged! Requesting live link...`);
                    
                    let checkoutUrl = "";
                    try {
                        const yocoResponse = await axios.post('https://yoco.com', 
                            { amount: 15000, currency: "ZAR", successUrl: "https://whatsapp.com" },
                            { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY.trim(), 'Content-Type': 'application/json' } }
                        );
                        checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                    } catch (yocoError) {
                        console.log("❌ Production Endpoint failed, checking staging fallback...");
                        try {
                            const fallbackResponse = await axios.post('https://yoco.com', 
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
app.listen(PORT, () => console.log(`🚀 Kickstart Runner Production Engine listening on port ${PORT}`));

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ==========================================
// 🔴 PRODUCTION CONFIGURATION BOX
// ==========================================
const YOCO_SECRET_KEY = "sk_live_320c671blVxJLZn61884c54a69dc";
const META_ACCESS_TOKEN = "EAAPsOFXPySgBSUR5QZCXp9f0fP8XKb9XTtI8J0UDZB7pgZBpmz7jdrlZAh7xtmlvkuvXo0iiBTpUUsQmFjCAcAcovBwZBLNWhSQ7zIYWLW745PZC2ZABkbuUsi2NaPl0OYardpmHeQRYV7MJdOoNXMGb3VdVuZCc6Ap7gCBTrEu3u7JNZA13CBt0vBotTE3kBPQZDZD";

const VERIFY_TOKEN = "kickstart_runner_secret_2026";

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

// 2. Main Processing Router
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

            // 🛒 MODE A: Incoming Shopping Carts (Your active customer orders)
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

                const deliveryFeeCents = 5000; // Flat R50.00 delivery running fee
                const grandTotalCents = produceTotalCents + deliveryFeeCents;
                const grandTotalRand = (grandTotalCents / 100).toFixed(2);
                
                console.log(`💰 Produce Subtotal: R${(produceTotalCents / 100).toFixed(2)}`);
                console.log(`🚚 Adding Reseller Delivery Fee: R50.00`);
                console.log(`🎯 Final Bill: R${grandTotalRand}`);

                try {
                    // 🌟 OFFICIAL BACKEND PRODUCTION GATEWAY ENDPOINT
                    const yocoResponse = await axios.post('https://yoco.com', 
                        { amount: grandTotalCents, currency: "ZAR", successUrl: "https://whatsapp.com" },
                        { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY, 'Content-Type': 'application/json' } }
                    );
                    
                    const checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                    console.log(`🔥 YOCO HOSTED INVOICE READY: ${checkoutUrl}`);
                    
                    const customerInvoiceText = `Hi ${customerName}! 👋\n\nThank you for ordering with Kickstart Resellers. We've verified your farm produce cart items:\n\n💰 Produce Subtotal: R${(produceTotalCents/100).toFixed(2)}\n🚚 Reseller Delivery: R50.00\n💵 *Grand Total: R${grandTotalRand}*\n\n🔒 Click the link below to settle securely via card or device payment:\n👉 ${checkoutUrl}\n\nYour fresh crate locks in for delivery immediately upon payment confirmation! 🥦🚚`;
                    
                    await axios.post(
                        'https://facebook.com',
                        { messaging_product: "whatsapp", recipient_type: "individual", to: customerPhone, type: "text", text: { preview_url: true, body: customerInvoiceText } },
                        { headers: { 'Authorization': 'Bearer ' + META_ACCESS_TOKEN, 'Content-Type': 'application/json' } }
                    );
                    console.log(`✉️ Outbound WhatsApp text pushed successfully to customer!`);
                    
                } catch (yocoError) {
                    console.error("❌ Yoco processing endpoint exception:", yocoError.response?.data || yocoError.message);
                }
                
            // 💬 MODE B: Regular Text Messages (Dashboard Test Trigger)
            } else if (messageData.type === 'text') {
                const textReceived = messageData.text.body.toLowerCase().trim();
                console.log(`💬 Inbound text received: "${textReceived}"`);

                if (textReceived === 'test' || textReceived === 'this is a text message') {
                    console.log(`🔄 Test sequence engaged! Generating sample invoice token...`);
                    try {
                        // 🌟 OFFICIAL BACKEND PRODUCTION GATEWAY ENDPOINT
                        const yocoResponse = await axios.post('https://yoco.com', 
                            { amount: 15000, currency: "ZAR", successUrl: "https://whatsapp.com" },
                            { headers: { 'Authorization': 'Bearer ' + YOCO_SECRET_KEY, 'Content-Type': 'application/json' } }
                        );
                        
                        const checkoutUrl = yocoResponse.data.redirectUrl || yocoResponse.data.url;
                        console.log(`🔥 YOCO MOCK INVOICE READY: ${checkoutUrl}`);
                        
                        const testMessageBody = `Hello! This is a live end-to-end connection confirmation from Kickstart Resellers. Your mock balance total including delivery is *R150.00*. Process sample checkout here: ${checkoutUrl}`;
                        
                        await axios.post(
                            'https://facebook.com',
                            { messaging_product: "whatsapp", recipient_type: "individual", to: customerPhone, type: "text", text: { preview_url: true, body: testMessageBody } },
                            { headers: { 'Authorization': 'Bearer ' + META_ACCESS_TOKEN, 'Content-Type': 'application/json' } }
                        );
                        console.log(`✉️ Outbound WhatsApp text pushed successfully to customer!`);
                        
                    } catch (yocoError) {
                        console.error("❌ Yoco test sequence exception:", yocoError.response?.data || yocoError.message);
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

import express, { Request, Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 3002;

app.use(cors());
app.use(express.json());

app.post('/api/switchboard', async (req: Request, res: Response) => {
    const paymentHeader = req.headers['x-402-payment'] as string | undefined;

    if (!paymentHeader) {
        return res.status(402).json({
            error: 'Payment Required',
            message: 'X-402-Payment header is required'
        });
    }

    const amount = parseFloat(paymentHeader);
    if (isNaN(amount) || amount <= 0) {
        return res.status(402).json({
            error: 'Invalid Payment',
            message: 'X-402-Payment must be a positive number'
        });
    }

    console.log(`[x402] Payment received: ${amount} USDC for Switchboard oracle`);

    // TODO: Validate payment via AgentPay SDK (as per PLAN.md)
    // For MVP, accept payment header and grant access

    // Mock Switchboard oracle response
    const mockPriceData = {
        price: 150.25,
        timestamp: Date.now(),
        symbol: 'SOL/USD',
        source: 'switchboard'
    };

    res.json(mockPriceData);
});

app.post('/api/llm', async (req: Request, res: Response) => {
    const paymentHeader = req.headers['x-402-payment'] as string | undefined;

    if (!paymentHeader) {
        return res.status(402).json({
            error: 'Payment Required',
            message: 'X-402-Payment header is required'
        });
    }

    const amount = parseFloat(paymentHeader);
    if (isNaN(amount) || amount <= 0) {
        res.status(402).json({
            error: 'Invalid Payment',
            message: 'X-402-Payment must be a positive number'
        });

        return;
    }

    console.log(`[x402] Payment received: ${amount} USDC for LLM inference`);

    // TODO: Validate payment via AgentPay SDK (as per PLAN.md)
    // For MVP, accept payment header and grant access

    res.json({
        response: 'LLM inference result (mock)',
        tokens_used: 100
    });
});

app.post('/api/data', async (req: Request, res: Response) => {
    const paymentHeader = req.headers['x-402-payment'] as string | undefined;

    if (!paymentHeader) {
        return res.status(402).json({
            error: 'Payment Required',
            message: 'X-402-Payment header is required'
        });
    }

    const amount = parseFloat(paymentHeader);
    if (isNaN(amount) || amount <= 0) {
        res.status(402).json({
            error: 'Invalid Payment',
            message: 'X-402-Payment must be a positive number'
        });

        return;
    }

    console.log(`[x402] Payment received: ${amount} USDC for data API`);

    // TODO: Validate payment via AgentPay SDK (as per PLAN.md)
    // For MVP, accept payment header and grant access

    res.json({
        data: 'External data result (mock)'
    });
});

app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'x402-gateway'
    });
});

app.listen(PORT, () => {
    console.log(`x402 Gateway Server Started on port ${PORT}`);
});


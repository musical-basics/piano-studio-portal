import * as React from 'react';

interface PaymentConfirmationEmailProps {
    amount: number;
    credits: number;
    date: string;
}

export const PaymentConfirmationEmail: React.FC<PaymentConfirmationEmailProps> = ({
    amount,
    credits,
    date,
}) => (
    <div style={{ fontFamily: 'sans-serif', lineHeight: '1.6', color: '#333' }}>
        <h1 style={{ color: '#111' }}>Payment Successful</h1>
        <p>Thank you for your purchase!</p>
        <p>We have successfully processed your payment and added credits to your account.</p>

        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', margin: '20px 0' }}>
            <p style={{ margin: '5px 0' }}><strong>Amount Paid:</strong> ${amount.toFixed(2)}</p>
            <p style={{ margin: '5px 0' }}><strong>Credits Added:</strong> {credits}</p>
            <p style={{ margin: '5px 0' }}><strong>Date:</strong> {date}</p>
        </div>

        <p>You can now book lessons using your credits.</p>
        <p style={{ fontSize: '12px', color: '#666', marginTop: '30px' }}>
            This represents a receipt for your purchase.
        </p>
    </div>
);

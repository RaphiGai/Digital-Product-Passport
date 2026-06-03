import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConsumerApp } from './ConsumerApp';
import '../index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConsumerApp />
  </StrictMode>
);

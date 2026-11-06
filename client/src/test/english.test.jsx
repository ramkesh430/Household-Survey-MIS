import { describe, it, expect, afterAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { setLanguage } from '@shared/i18n/index.js';
import SurveyForm from '../survey/SurveyForm.jsx';

function Harness() {
  const [a, setA] = useState({});
  return <SurveyForm answers={a} onChange={(u) => setA((p) => (typeof u === 'function' ? u(p) : u))} />;
}

describe('English interface', () => {
  afterAll(() => setLanguage('ne'));
  it('renders questions, options, tables and totals in English with Latin digits; stored codes unchanged', () => {
    setLanguage('en');
    render(<Harness />);
    expect(screen.getByText('Family size')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('25–45 years – Female'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('25–45 years – Male'), { target: { value: '१' } });
    expect(screen.getByLabelText('25–45 years – Total')).toHaveTextContent('3');
    fireEvent.click(screen.getByRole('button', { name: /Drinking water/ }));
    const q6 = document.getElementById('q-q6');
    expect(within(q6).getByText('What is the main source of drinking water for your family?')).toBeInTheDocument();
    const piped = within(q6).getByLabelText(/Piped tap water/);
    expect(piped.closest('label')).toHaveTextContent('क)'); // original PDF code kept
    fireEvent.click(piped);
    expect(piped).toBeChecked();
  });
});

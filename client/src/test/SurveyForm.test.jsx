import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SurveyForm from '../survey/SurveyForm.jsx';
import { sections, questions } from '@shared/questionnaire.js';

function Harness({ initial = {}, onAnswers, ...rest }) {
  const [a, setA] = useState(initial);
  return <SurveyForm answers={a} onChange={(u) => setA((p) => { const n = typeof u === 'function' ? u(p) : u; onAnswers?.(n); return n; })} {...rest} />;
}

describe('SurveyForm', () => {
  it('renders every numbered question across the sections (with conditions satisfied)', () => {
    // Q73 only shows when Q72 = yes
    render(<Harness initial={{ q72: { has: '१' } }} />);
    const seen = new Set();
    for (const s of sections) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(s.title.split(',')[0]) }));
      questions.filter((q) => q.section === s.id).forEach((q) => {
        const el = document.getElementById(`q-${q.id}`);
        expect(el, `question ${q.id}`).toBeInTheDocument();
        if (q.no) seen.add(q.no);
      });
    }
    expect(seen.size).toBe(77);
  });

  it('accepts Nepali digits in tables and computes row & column totals', () => {
    let latest;
    render(<Harness onAnswers={(a) => { latest = a; }} />);
    const female = screen.getByLabelText('२५ – ४५ वर्षसम्म – महिला');
    const male = screen.getByLabelText('२५ – ४५ वर्षसम्म – पुरुष');
    fireEvent.change(female, { target: { value: '२' } });
    fireEvent.change(male, { target: { value: '3' } });
    expect(latest.q5.age_table['25_45']).toEqual({ female: 2, male: 3 });
    expect(screen.getByLabelText('२५ – ४५ वर्षसम्म – जम्मा')).toHaveTextContent('५');
    // family size auto-filled from table total
    const q5 = document.getElementById('q-q5');
    expect(within(q5).getAllByText('५').length).toBeGreaterThan(0);
  });

  it('shows follow-up fields only when the condition is met', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /मातृ/ }));
    const q20 = document.getElementById('q-q20');
    expect(within(q20).queryByText(/ARV Prophylaxis/)).not.toBeInTheDocument();
    fireEvent.click(within(q20).getAllByRole('radio')[0]);
    expect(within(q20).getByText(/ARV Prophylaxis/)).toBeInTheDocument();
  });

  it('exclusive "none" option clears other choices in multi-select', () => {
    let latest;
    render(<Harness onAnswers={(a) => { latest = a; }} />);
    fireEvent.click(screen.getByRole('button', { name: /बाल संरक्षण/ }));
    const q36 = document.getElementById('q-q36');
    fireEvent.click(within(q36).getByLabelText(/दाईजोसम्बन्धी/));
    fireEvent.click(within(q36).getByLabelText(/घरायसी हिंसा/));
    expect(latest.q36.ans).toEqual(['क', 'ग']);
    fireEvent.click(within(q36).getByLabelText(/कुनै पनि घटना नघटेको/));
    expect(latest.q36.ans).toEqual(['ञ']);
  });

  it('shows the specify box for "other" options', () => {
    let latest;
    render(<Harness onAnswers={(a) => { latest = a; }} />);
    fireEvent.click(screen.getByRole('button', { name: /खानेपानी/ }));
    const q6 = document.getElementById('q-q6');
    fireEvent.click(within(q6).getByLabelText(/खुलाउने/));
    fireEvent.change(within(q6).getByLabelText('अन्य खुलाउनुहोस्'), { target: { value: 'मुहान' } });
    expect(latest.q6).toEqual({ ans: 'च', ans__other: 'मुहान' });
  });

  it('adds and removes repeatable rows (Q19 pregnant women)', () => {
    let latest;
    render(<Harness onAnswers={(a) => { latest = a; }} />);
    fireEvent.click(screen.getByRole('button', { name: /मातृ/ }));
    const q19 = document.getElementById('q-q19');
    fireEvent.click(within(q19).getByRole('button', { name: /गर्भवती थप्नुहोस्/ }));
    fireEvent.click(within(q19).getByRole('button', { name: /गर्भवती थप्नुहोस्/ }));
    expect(latest.q19.rows).toHaveLength(2);
    expect(within(q19).queryByText(/प्रसूति कहाँ भएको/)).not.toBeInTheDocument();
    fireEvent.change(within(q19).getAllByRole('combobox')[0], { target: { value: 'भएको' } });
    expect(within(q19).getByText(/प्रसूति कहाँ भएको/)).toBeInTheDocument();
    fireEvent.click(within(q19).getAllByRole('button', { name: 'हटाउनुहोस्' })[1]);
    expect(latest.q19.rows).toHaveLength(1);
  });

  it('displays validation errors next to the question', () => {
    render(<Harness errors={[{ q: 'q6', field: 'ans', path: 'q6.ans', message: 'यो प्रश्नको उत्तर आवश्यक छ' }]} />);
    expect(screen.getByRole('button', { name: /खानेपानी/ })).toHaveTextContent('१');
    fireEvent.click(screen.getByRole('button', { name: /खानेपानी/ }));
    expect(within(document.getElementById('q-q6')).getByText(/उत्तर आवश्यक/)).toBeInTheDocument();
  });

  it('is read-only after submission', () => {
    render(<Harness readOnly initial={{ q6: { ans: 'क' } }} />);
    fireEvent.click(screen.getByRole('button', { name: /खानेपानी/ }));
    const radio = within(document.getElementById('q-q6')).getAllByRole('radio')[0];
    expect(radio).toBeChecked();
    expect(radio.closest('fieldset')).toBeDisabled();
  });
});

import { tr } from '@shared/i18n/index.js';

export default function Footer({ version }) {
  return (
    <footer className="portal-footer">
      <p><span>© Mayadevi Gaunpalika (Mayadevi Rural Municipality),</span> <span lang="ne">{tr('बरेवा, रुपन्देही, लुम्बिनी प्रदेश, नेपाल')}।</span> <span>{tr('सबै अधिकार सुरक्षित।')}</span></p>
      <p>{tr('संस्करण')} (Version): <strong>v{version}</strong></p>
    </footer>
  );
}

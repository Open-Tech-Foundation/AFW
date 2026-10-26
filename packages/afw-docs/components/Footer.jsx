// Site footer, driven by `config.footer` ({ text, links }).

export default function Footer(props) {
  const config = props.config || {};
  const footer = config.footer || {};
  const text = footer.text || "Built with AFW";
  const links = footer.links || [];

  return (
    <footer class="afw-footer">
      <div class="afw-footer-inner">
        <div class="afw-footer-text">{text}</div>
        {links.length > 0 ? (
          <div class="afw-footer-links">
            {links.map((l) => (
              <a href={l.href} class="afw-footer-link">
                {l.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}

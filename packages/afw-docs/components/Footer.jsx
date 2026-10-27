// Site footer, driven by `config.footer` ({ text, links }).

export default function Footer(props) {
  const config = props.config || {};
  const footer = config.footer || {};
  const text = footer.text || "Built with AFW";
  const links = footer.links || [];

  return (
    <footer class="afwd-footer">
      <div class="afwd-footer-inner">
        <div class="afwd-footer-text">{text}</div>
        {links.length > 0 ? (
          <div class="afwd-footer-links">
            {links.map((l) => (
              <a href={l.href} class="afwd-footer-link">
                {l.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}

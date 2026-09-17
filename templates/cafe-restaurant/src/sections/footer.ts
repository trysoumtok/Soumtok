export function mountFooter(host: HTMLElement) {
  host.innerHTML = `
    <footer id="contact" class="site-footer">
      <div class="container footer-inner">
        <p class="footer-brand">{{brand}}</p>
        <nav aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="mailto:hello@example.com">Contact</a>
        </nav>
        <p class="copyright">&copy; ${new Date().getFullYear()} {{brand}}. All rights reserved.</p>
      </div>
    </footer>
  `
}

// Styled, horizontally-scrollable table wrapper. (MDX GFM tables already emit
// the same wrapper around a theme-styled <table>; use <Table> in JSX pages.)

export default function Table(props) {
  return (
    <div class="afw-table-wrap" tabindex="0">
      <table class="afw-table">{props.children}</table>
    </div>
  );
}

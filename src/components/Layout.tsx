export const Layout = (props: SiteData) => {
  return (
    <html lang="en">
      <head>
        <title>{props.title}</title>
        <meta name="description" content={props.subtitle} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charset="UTF-8" />
        <meta name="color-scheme" content="light dark" />
        <link rel="stylesheet" href="/static/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Arimo&family=Montserrat&family=Roboto:wght@100&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{props.children}</body>
    </html>
  );
};

# Lnd Mempool.Space Integration

This project aims to integrate the Lightning Network Daemon (lnd) with mempool.space, a Bitcoin blockchain explorer. The primary feature of this integration is to provide fee estimates to lnd based on the fee estimates from mempool.space.

## Features

- Fee Estimates: The integration fetches fee estimates from mempool.space and provides them to lnd.

## Setup & Usage

1. Clone this repository to your local machine.
2. Install the necessary dependencies.
3. Set the feeurl in your lnd configuration to point to the /fee-estimates endpoint of this server.

For example:

```
feeurl = http://localhost:3000/fee-estimates
```

Replace http://localhost:3000 with the address of your server.

Please ensure that your server is properly configured to allow connections from the machine where lnd is running. You may need to adjust your firewall settings or other security configurations to allow this.

In addition, you may need to adjust the settings of your mempool.space instance to allow API requests from this integration. Please refer to the mempool.space documentation for more information on this.

> **Note:** By default, this integration connects to the public API of mempool.space. However, for better performance and reliability, it is recommended to run your own instance of mempool.space and configure this integration to connect to it.

## Configuration Options

This project uses the `config` package for configuration. The configuration options are stored in `default.json` and `custom-environment-variables.json` in the `config` directory.

Here are the available configuration options:

- `server.port`: The port on which the server runs. Default is `3000`.
- `mempool.hostname`: The hostname of the mempool.space instance to connect to. Default is `mempool.space`.

You can override these options by setting the corresponding environment variables:

- `PORT`: Overrides `server.port`.
- `MEMPOOL_HOSTNAME`: Overrides `mempool.hostname`.

For example, to run the server on port 4000 and connect to a local mempool.space instance, you can start the server like this:

```bash
PORT=4000 MEMPOOL_HOSTNAME=localhost npm start
```

## Docker

This project includes Docker support. You can build a Docker image and run it with the following scripts:

- `docker:build`: Builds a Docker image of the project. You can run this script with `npm run docker:build`.
- `docker:run`: Runs the Docker image. You can run this script with `npm run docker:run`.

For example, to build and run the Docker image, you can use the following commands:

```bash
npm run docker:build
npm run docker:run
```

To run the Docker image with custom configuration, you can use the following command:

```bash
docker run --init -p 3000:3000 -e MEMPOOL_HOSTNAME=my.mempool.space lnd-mempoolspace
```

## Releasing

Releasing a new version of this project involves cutting a new release on GitHub. 

When a new release is created on GitHub, it triggers a Docker build and push to Docker Hub. This is done through GitHub Actions, which is configured to automatically build a new Docker image and push it to Docker Hub whenever a new release is created.

Here are the steps to create a new release:

1. Merge your changes into the `master` branch.
2. Click on "Releases" in the right sidebar of the GitHub repository page.
3. Click on "Draft a new release".
4. Enter a tag version (e.g., `v1.0.1`), release title, and description.
5. Click on "Publish release".

Once the release is published, the Docker build and push process will start automatically. You can monitor the progress of the build on the "Actions" tab of the GitHub repository page.

Please note that you need to have the necessary permissions to create a release and push to Docker Hub.

## Contributing
We welcome contributions to this project. Please feel free to open an issue or submit a pull request.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.

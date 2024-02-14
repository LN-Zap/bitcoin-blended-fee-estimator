# Releasing

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

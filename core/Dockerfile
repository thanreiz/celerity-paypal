# Celerity core for Google Cloud Run. Build context is core/.
# Tests run in CI (they need ../contracts), so the image build skips them.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && cp target/core-*.jar /src/app.jar

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 core
WORKDIR /app
COPY --from=build /src/app.jar app.jar
USER core
# Cloud Run sets PORT (8080); application.yml reads it.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+UseSerialGC", "-jar", "/app/app.jar"]

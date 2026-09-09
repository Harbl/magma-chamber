#!/usr/bin/perl
# Minimal static file server using only core Perl modules.
#
# macOS ships Perl, so this runs on a stock Mac with nothing installed --
# unlike python3 (a stub that prompts to install Xcode tools) or Ruby
# (deprecated since Catalina and not guaranteed on current macOS).
#
#   perl tools/serve.pl [port]

use strict;
use warnings;
use IO::Socket::INET;
use File::Basename qw(dirname);
use File::Spec;
use Cwd qw(abs_path);

my $port = $ARGV[0] || 8080;
my $root = abs_path(File::Spec->catdir(dirname(abs_path($0)), File::Spec->updir));

my %MIME = (
  html => 'text/html',  js   => 'text/javascript', css => 'text/css',
  json => 'application/json', svg => 'image/svg+xml', png => 'image/png',
  webp => 'image/webp', ico  => 'image/x-icon', txt => 'text/plain',
  webmanifest => 'application/manifest+json',
);

$SIG{CHLD} = 'IGNORE';   # reap finished children automatically

my $server = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1',   # loopback only; nothing off this Mac needs it
  LocalPort => $port,
  Proto     => 'tcp',
  Listen    => 16,
  ReuseAddr => 1,
) or die "Could not start on port $port: $!\n";

print "\n  Magma Chamber running at  http://localhost:$port\n\n";
print "  Signup import works here because localhost is allowlisted by the API.\n";
print "  Press Ctrl+C to stop.\n\n";

while (my $client = $server->accept) {
  my $pid = fork;
  next unless defined $pid;
  if ($pid) { close $client; next; }   # parent keeps listening
  close $server;                       # child serves one request
  handle($client);
  exit 0;
}

sub handle {
  my ($c) = @_;
  my $request = <$c>;
  return close $c unless defined $request
    && $request =~ m{^GET\s+(\S+)\s+HTTP/1\.[01]};
  my $path = $1;

  while (my $line = <$c>) { last if $line =~ /^\r?\n$/ }   # drain headers

  $path =~ s/\?.*//;
  $path =~ s/%([0-9A-Fa-f]{2})/chr hex $1/ge;
  $path = '/index.html' if $path eq '/';
  $path =~ s{^/+}{};

  # abs_path resolves any ".." before we compare against the root.
  my $file = abs_path(File::Spec->catfile($root, split m{/}, $path));
  return not_found($c, $path)
    unless $file && index($file, $root) == 0 && -f $file;

  open my $fh, '<:raw', $file or return not_found($c, $path);
  my $body = do { local $/; <$fh> };
  close $fh;

  my ($ext) = $file =~ /\.([A-Za-z0-9]+)$/;
  my $type = $MIME{lc($ext || '')} || 'application/octet-stream';

  print $c "HTTP/1.1 200 OK\r\n",
           "Content-Type: $type\r\n",
           "Content-Length: ", length($body), "\r\n",
           "Cache-Control: no-store\r\n",
           "Connection: close\r\n\r\n",
           $body;
  close $c;
}

sub not_found {
  my ($c, $path) = @_;
  my $body = "Not found: $path";
  print $c "HTTP/1.1 404 Not Found\r\n",
           "Content-Type: text/plain\r\n",
           "Content-Length: ", length($body), "\r\n",
           "Connection: close\r\n\r\n",
           $body;
  close $c;
}

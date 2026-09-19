import 'package:flutter/material.dart';

/// Byte-exact bundle copy of public/brand/beyu-os-logo.png.
/// Run `npm run brand:sync` at the repository root before Flutter builds.
class BeyuOsLogo extends StatelessWidget {
  final double size;
  const BeyuOsLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/images/beyu-os-logo.png',
    width: size,
    height: size,
    fit: BoxFit.contain,
    semanticLabel: 'BEYU OS',
  );
}
